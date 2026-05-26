# Load .env.local from parent folder
Get-Content .env.local | ForEach-Object {
    if ($_ -match "^\s*#") { return }   # skip comments
    if ($_ -match "^\s*$") { return }   # skip empty lines
    $name, $value = $_ -split "=", 2
    # Set in current process scope
    [System.Environment]::SetEnvironmentVariable($name, $value, "Process")
}

Write-Host "Environment variables loaded:" -ForegroundColor Green
Write-Host "  SMS_PROVIDER: $env:SMS_PROVIDER"
Write-Host "  TWILIO_ACCOUNT_SID: $($env:TWILIO_ACCOUNT_SID.Substring(0, 5))..."
Write-Host "  TWILIO_FROM: $env:TWILIO_FROM"
Write-Host ""

Write-Host "Starting supabase functions serve..." -ForegroundColor Green
supabase functions serve
