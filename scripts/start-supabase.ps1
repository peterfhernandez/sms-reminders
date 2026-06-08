# Load .env.local from parent folder
Get-Content .env.local | ForEach-Object {
    if ($_ -match "^\s*#") { return }   # skip comments
    if ($_ -match "^\s*$") { return }   # skip empty lines
    $name, $value = $_ -split "=", 2
    [System.Environment]::SetEnvironmentVariable($name, $value)
}

supabase start
