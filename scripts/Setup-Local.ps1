# ============================================================
# SMS REMINDERS — Local Dev Setup Script (Windows 11)
# Run once after cloning the repo:
#   Right-click PowerShell → Run as Administrator, then:
#   Set-ExecutionPolicy RemoteSigned -Scope CurrentUser
#   .\scripts\Setup-Local.ps1
# ============================================================

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "==> Setting up SMS Reminders local dev environment..." -ForegroundColor Cyan
Write-Host ""

# --- Check Node.js ---
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "Node.js not found. Installing via winget..." -ForegroundColor Yellow
    winget install --id OpenJS.NodeJS.LTS --source winget --accept-package-agreements --accept-source-agreements
    Write-Host "Please restart this terminal after Node.js installs, then re-run this script." -ForegroundColor Yellow
    exit 0
}
$nodeVersion = (node -v) -replace 'v', '' -split '\.' | Select-Object -First 1
if ([int]$nodeVersion -lt 20) {
    Write-Host "Node.js 20+ required. Current: $(node -v). Run: winget upgrade OpenJS.NodeJS.LTS" -ForegroundColor Red
    exit 1
}
Write-Host "OK  Node.js $(node -v)" -ForegroundColor Green

# --- Check npm ---
Write-Host "OK  npm $(npm -v)" -ForegroundColor Green

# --- Check Supabase CLI ---
if (-not (Get-Command supabase -ErrorAction SilentlyContinue)) {
    Write-Host ""
    Write-Host "Supabase CLI not found. Installing via Scoop..." -ForegroundColor Yellow
    if (-not (Get-Command scoop -ErrorAction SilentlyContinue)) {
        Write-Host "Installing Scoop first..." -ForegroundColor Yellow
        irm get.scoop.sh | iex
    }
    scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
    scoop install supabase
}
Write-Host "OK  Supabase CLI $(supabase --version)" -ForegroundColor Green

# --- Check Docker ---
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Host ""
    Write-Host "Docker Desktop not found. Please install it:" -ForegroundColor Red
    Write-Host "  winget install --id Docker.DockerDesktop" -ForegroundColor Yellow
    Write-Host "Then start Docker Desktop and re-run this script." -ForegroundColor Yellow
    exit 1
}
Write-Host "OK  Docker $(docker --version)" -ForegroundColor Green

# --- Install dependencies ---
Write-Host ""
Write-Host "Installing npm dependencies..." -ForegroundColor Cyan
npm install

# --- Setup .env.local ---
if (-not (Test-Path ".env.local")) {
    Write-Host ""
    Write-Host "Creating .env.local from template..." -ForegroundColor Cyan
    Copy-Item ".env.example" ".env.local"
    Write-Host "ACTION NEEDED: Edit .env.local and fill in your Supabase keys." -ForegroundColor Yellow
} else {
    Write-Host "OK  .env.local already exists (skipping)" -ForegroundColor Green
}

# --- Start Supabase locally ---
Write-Host ""
Write-Host "Starting local Supabase (requires Docker to be running)..." -ForegroundColor Cyan
supabase start

Write-Host ""
Write-Host "Applying migrations and seed data..." -ForegroundColor Cyan
supabase db reset

Write-Host ""
Write-Host "============================================================" -ForegroundColor Green
Write-Host "Local dev environment is ready!" -ForegroundColor Green
Write-Host ""
Write-Host "Local Supabase Studio:  http://localhost:54323"
Write-Host "Local API:              http://localhost:54321"
Write-Host ""
Write-Host "Next steps:"
Write-Host "  1. Copy the anon + service_role keys printed above into .env.local"
Write-Host "  2. Run: npm run dev"
Write-Host "  3. Open: http://localhost:3000"
Write-Host "============================================================" -ForegroundColor Green
Write-Host ""
