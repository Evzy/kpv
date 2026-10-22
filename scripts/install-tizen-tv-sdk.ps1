# Requires Administrator (UAC). Adds Samsung TV SDK + TV emulator to Tizen Studio.
#Requires -RunAsAdministrator
$ErrorActionPreference = "Stop"
$InstallRoot = Join-Path $env:USERPROFILE "tizen-studio"
$Pm = Join-Path $InstallRoot "package-manager\package-manager-cli.exe"
if (-not (Test-Path $Pm)) {
    Write-Error "Run scripts\install-tizen-studio.ps1 first."
}

Set-Location (Split-Path $Pm -Parent)

Write-Host "Listing extra SDK extensions..."
$extraList = & $Pm extra --list 2>&1 | Out-String
Write-Host $extraList

# Samsung TV SDK (index/repo vary by Studio version; parse or use known URL)
$tvRepo = "https://sdf.samsungcloudcdn.com/Public/smart_tv_sdk/releases/samsung_tizen_studio_tv_sdk/stv_ext_public/TV"
Write-Host "Activating Samsung Tizen TV SDK extension..."
& $Pm extra 1 -r $tvRepo --activate 2>&1 | Out-Host
# If index 1 fails, run: package-manager-cli.exe extra --list
# and pass the correct index + -r URL from that output.

Write-Host "Installing TV platform + emulator (large download)..."
$pkgs = @(
    "TV-SAMSUNG-Public",
    "TV-SAMSUNG-Public-Emulator",
    "TV-SAMSUNG-Public-WebAppDevelopment",
    "TV-SAMSUNG-Extension-Tools",
    "TV-SAMSUNG-Extension-Resources"
)
foreach ($p in $pkgs) {
    Write-Host "  -> $p"
    & $Pm install --accept-license --no-java-check $p 2>&1 | Out-Host
}

Write-Host ""
Write-Host "Done. Add to PATH (once per session): . .\scripts\set-tizen-env.ps1"
Write-Host "Create/start TV emulator from Tizen Studio Device Manager, or em-cli if installed."
Write-Host "Install KPV: .\scripts\install-kpv-wgt-emulator.ps1"
