# Verify Supabase is running
Write-Host "Checking Supabase status..." -ForegroundColor Cyan
$status = supabase status 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "✗ Supabase is not running. Start it first with: supabase start" -ForegroundColor Red
    exit 1
}

Write-Host "✓ Supabase is running" -ForegroundColor Green

# Verify .env.local exists
if (-not (Test-Path ".env.local")) {
    Write-Host "✗ .env.local not found. Copy .env.example to .env.local and fill in your credentials." -ForegroundColor Red
    exit 1
}

Write-Host "✓ .env.local found" -ForegroundColor Green
Write-Host ""

Write-Host "Starting supabase functions serve with .env.local..." -ForegroundColor Green
supabase functions serve --env-file .env.local
