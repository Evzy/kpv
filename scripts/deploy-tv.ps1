# Build, sign and install KPV on the Samsung TV over sdb (what Apps2Samsung does from the phone).
# Prereqs: TV Developer mode Host PC IP = this PC; Samsung certificate profile created in Certificate Manager.
param(
    [string]$TvIp = "192.168.68.53",
    [string]$CertProfile = "Kevy",
    [string]$AppId = "KpvPlayer1.KPV",
    [switch]$SkipBuild,
    [switch]$Reinstall,
    [switch]$Debug
)
$ErrorActionPreference = "Stop"
$Root = Split-Path $PSScriptRoot -Parent
$Ts = Join-Path $env:USERPROFILE "tizen-studio"
$Sdb = Join-Path $Ts "tools\sdb.exe"
$TizenCli = Join-Path $Ts "tools\ide\bin\tizen.bat"
$Target = "${TvIp}:26101"

function Invoke-Sdb([string]$CmdArgs) {
    $out = cmd /c "`"$Sdb`" $CmdArgs 2>&1"
    $out | ForEach-Object { Write-Host "  $_" }
    return ($out -join "`n")
}

Write-Host "Connecting to TV $Target ..."
$conn = Invoke-Sdb "connect $TvIp"
if ($conn -match "failed") {
    Write-Error "TV refused sdb. On the TV: Apps > 12345 > Host PC IP = this PC's IP, then restart the TV."
}

if (-not $SkipBuild) {
    Push-Location (Join-Path $Root "tizen")
    try { npm run package } finally { Pop-Location }
}

$Wgt = Join-Path $Root "tizen\KPV.wgt"
$SignDir = Join-Path $Root "tizen\.cache\signed"
New-Item -ItemType Directory -Force -Path $SignDir | Out-Null
Copy-Item $Wgt (Join-Path $SignDir "KPV.wgt") -Force

Write-Host "Signing with certificate profile '$CertProfile' ..."
cmd /c "`"$TizenCli`" package -t wgt -s $CertProfile -- `"$(Join-Path $SignDir 'KPV.wgt')`""
if ($LASTEXITCODE -ne 0) {
    Write-Error "Signing failed. Create the Samsung TV certificate profile '$CertProfile' in Certificate Manager first."
}

if ($Reinstall) {
    Write-Host "Uninstalling existing $AppId (needed once when it was signed by another certificate) ..."
    cmd /c "`"$TizenCli`" uninstall -p $AppId -s $Target 2>&1" | Out-Null
}

# `sdb install` only pushes the file on Samsung TVs; `tizen install` runs the package manager.
Write-Host "Installing ..."
$install = cmd /c "`"$TizenCli`" install -n KPV.wgt -s $Target -- `"$SignDir`" 2>&1"
$install | ForEach-Object { Write-Host "  $_" }
$installText = $install -join "`n"
if ($installText -match "install failed") {
    if ($installText -match "-12") {
        Write-Error "Install rejected by signature. Run again with -Reinstall (resets site URL / pairing on the TV once)."
    }
    Write-Error "Install failed."
}

if ($Debug) {
    Write-Host "Launching in debug mode ..."
    $dbg = Invoke-Sdb "-s $Target shell 0 debug $AppId"
    if ($dbg -match "port:\s*(\d+)") {
        $port = $Matches[1]
        Invoke-Sdb "-s $Target forward tcp:9222 tcp:$port" | Out-Null
        Write-Host "DevTools: http://127.0.0.1:9222 (or chrome://inspect -> localhost:9222)"
    } else {
        Write-Warning "Could not read debug port from: $dbg"
    }
} else {
    Write-Host "Launching ..."
    Invoke-Sdb "-s $Target shell 0 execute $AppId" | Out-Null
}
Write-Host "Done."
