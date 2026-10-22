# Builds KPV.wgt and installs on a connected Tizen emulator/TV via sdb (after TV SDK installed).
$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "set-tizen-env.ps1")
$Root = Split-Path $PSScriptRoot -Parent
$Sdb = Join-Path $env:TIZEN_STUDIO "tools\sdb.exe"
if (-not (Test-Path $Sdb)) {
    Write-Error "sdb not found. Complete install-tizen-tv-sdk.ps1 and start an emulator."
}

Push-Location (Join-Path $Root "tizen")
try {
    npm run package
} finally {
    Pop-Location
}

$Wgt = Join-Path $Root "tizen\KPV.wgt"
if (-not (Test-Path $Wgt)) {
    Write-Error "Missing $Wgt"
}

Write-Host "Devices:"
& $Sdb devices
$serial = (& $Sdb devices | Select-String "emulator-" | ForEach-Object { ($_ -split "\s+")[0] } | Select-Object -First 1)
if (-not $serial) {
    Write-Error "No emulator in 'sdb devices'. Start TV emulator from Device Manager first."
}

$TizenCli = Get-ChildItem -Path (Join-Path $env:TIZEN_STUDIO "platforms") -Recurse -Filter "tizen.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
if ($TizenCli) {
    Write-Host "Installing via tizen CLI..."
    & $TizenCli.FullName install -s $serial -n KPV.wgt -- (Split-Path $Wgt -Parent)
} else {
    Write-Host "tizen.exe not found; pushing WGT with sdb (manual launch may be needed)..."
    & $Sdb -s $serial push $Wgt /home/owner/share/tmp/KPV.wgt
    Write-Host "Pushed to device. Use Device Manager or: tizen install -s $serial -n KPV.wgt -- ..."
}

Write-Host "KPV WGT install attempted on $serial"
