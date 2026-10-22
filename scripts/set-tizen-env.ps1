# Dot-source: . .\scripts\set-tizen-env.ps1
$Ts = Join-Path $env:USERPROFILE "tizen-studio"
if (-not (Test-Path $Ts)) {
    Write-Warning "Tizen Studio not found at $Ts"
    return
}
$env:TIZEN_STUDIO = $Ts
$paths = @(
    (Join-Path $Ts "tools"),
    (Join-Path $Ts "tools\ide\bin"),
    (Join-Path $Ts "platforms\tizen-6.0\tizen\tools")
) | Where-Object { Test-Path $_ }
if ($paths.Count) {
    $env:PATH = ($paths -join ";") + ";" + $env:PATH
}
Write-Host "TIZEN_STUDIO=$env:TIZEN_STUDIO"
