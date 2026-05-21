# ============================================================
# SMS Reminders — Local Dev Setup (Windows 11)
# Stack: Supabase (Docker) + ClickSend + Whisper + Node
#
# Run once after cloning:
#   1. Open PowerShell as Administrator
#   2. Set-ExecutionPolicy RemoteSigned -Scope CurrentUser
#   3. cd C:\path\to\sms-reminders
#   4. .\scripts\Setup-Local.ps1
# ============================================================

$ErrorActionPreference = "Stop"

function OK  ($msg) { Write-Host "  OK  $msg" -ForegroundColor Green }
function WARN($msg) { Write-Host "  !!  $msg" -ForegroundColor Yellow }
function STEP($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }
function FAIL($msg) { Write-Host "  ERR $msg" -ForegroundColor Red; exit 1 }

Write-Host ""
Write-Host "  SMS Reminders — Local Setup" -ForegroundColor White
Write-Host "  ──────────────────────────" -ForegroundColor DarkGray
Write-Host ""

# ── 1. Check Node.js 20+ ─────────────────────────────────────
STEP "Checking Node.js"
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    WARN "Node.js not found — installing via winget..."
    winget install --id OpenJS.NodeJS.LTS --source winget --accept-package-agreements --accept-source-agreements
    WARN "Restart this terminal after install, then re-run this script."
    exit 0
}
$nodeMajor = [int]((node -v) -replace 'v','').Split('.')[0]
if ($nodeMajor -lt 20) { FAIL "Node.js 20+ required. Current: $(node -v). Run: winget upgrade OpenJS.NodeJS.LTS" }
OK "Node.js $(node -v)"
OK "npm $(npm -v)"

# ── 2. Check Git ──────────────────────────────────────────────
STEP "Checking Git"
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    WARN "Git not found — installing..."
    winget install --id Git.Git --source winget --accept-package-agreements
}
OK "Git $(git --version)"

# ── 3. Check Docker ───────────────────────────────────────────
STEP "Checking Docker"
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    FAIL "Docker Desktop not found.`n     Install: winget install --id Docker.DockerDesktop`n     Then start Docker Desktop and re-run."
}
$dockerRunning = (docker info 2>&1) -match "Server Version"
if (-not $dockerRunning) { FAIL "Docker is installed but not running. Start Docker Desktop, then re-run." }
OK "Docker $(docker --version)"

# ── 4. Check / install Supabase CLI ──────────────────────────
STEP "Checking Supabase CLI"
if (-not (Get-Command supabase -ErrorAction SilentlyContinue)) {
    WARN "Supabase CLI not found — installing via Scoop..."
    if (-not (Get-Command scoop -ErrorAction SilentlyContinue)) {
        WARN "Installing Scoop..."
        Invoke-RestMethod get.scoop.sh | Invoke-Expression
    }
    scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
    scoop install supabase
}
OK "Supabase CLI $(supabase --version)"

# ── 5. Check / install Deno (for running functions locally) ──
STEP "Checking Deno"
if (-not (Get-Command deno -ErrorAction SilentlyContinue)) {
    WARN "Deno not found — installing..."
    winget install --id DenoLand.Deno --source winget --accept-package-agreements
    # Refresh PATH
    $env:PATH = [System.Environment]::GetEnvironmentVariable("PATH", "Machine") + ";" +
                [System.Environment]::GetEnvironmentVariable("PATH", "User")
}
OK "Deno $(deno --version | Select-Object -First 1)"

# ── 6. Install Node dependencies ──────────────────────────────
STEP "Installing npm dependencies"
npm install
OK "npm packages installed"

# ── 7. Create .env if missing ─────────────────────────────────
STEP "Setting up environment file"
if (-not (Test-Path ".env")) {
    Copy-Item ".env.example" ".env"
    WARN ".env created from .env.example"
    WARN "You must fill in .env BEFORE running functions — see SETUP.md §3"
} else {
    OK ".env already exists"
}

# ── 8. Start local Supabase ───────────────────────────────────
STEP "Starting local Supabase (Docker)"
supabase start

# ── 9. Apply migrations ───────────────────────────────────────
STEP "Applying database migrations"
supabase db reset

# ── 10. Copy keys into .env automatically ─────────────────────
STEP "Capturing Supabase local keys"
$status = supabase status --output json | ConvertFrom-Json
$apiUrl      = $status.API_URL
$anonKey     = $status.ANON_KEY
$serviceKey  = $status.SERVICE_ROLE_KEY

# Update .env in-place
(Get-Content ".env") `
    -replace 'SUPABASE_URL=.*',              "SUPABASE_URL=$apiUrl" `
    -replace 'SUPABASE_ANON_KEY=.*',         "SUPABASE_ANON_KEY=$anonKey" `
    -replace 'SUPABASE_SERVICE_ROLE_KEY=.*', "SUPABASE_SERVICE_ROLE_KEY=$serviceKey" |
    Set-Content ".env"

OK "SUPABASE_URL, ANON_KEY, SERVICE_ROLE_KEY written to .env"

# ── 11. Seed sample data ──────────────────────────────────────
STEP "Seeding sample reminders"
node scripts/seed.js
OK "Sample reminders inserted"

# ── Done ──────────────────────────────────────────────────────
Write-Host ""
Write-Host "  ┌────────────────────────────────────────────┐" -ForegroundColor Green
Write-Host "  │  Local environment ready!                  │" -ForegroundColor Green
Write-Host "  │                                            │" -ForegroundColor Green
Write-Host "  │  Supabase Studio  http://localhost:54323   │" -ForegroundColor Green
Write-Host "  │  Supabase API     http://localhost:54321   │" -ForegroundColor Green
Write-Host "  │                                            │" -ForegroundColor Green
Write-Host "  │  Next steps:                               │" -ForegroundColor Green
Write-Host "  │  1. Add ClickSend + OpenAI keys to .env    │" -ForegroundColor Green
Write-Host "  │  2. supabase functions serve               │" -ForegroundColor Green
Write-Host "  │  3. See SETUP.md for testing commands      │" -ForegroundColor Green
Write-Host "  └────────────────────────────────────────────┘" -ForegroundColor Green
Write-Host ""
