# Downloads (if needed) and installs Tizen Studio 6.0 CLI to %USERPROFILE%\tizen-studio.
# TV emulator packages need a separate Admin step: scripts\install-tizen-tv-sdk.ps1
$ErrorActionPreference = "Stop"
$Root = Split-Path $PSScriptRoot -Parent
$Cache = Join-Path $Root "tools\tizen-install"
$Installer = Join-Path $Cache "web-cli_Tizen_Studio_6.0_windows-64.exe"
$InstallRoot = Join-Path $env:USERPROFILE "tizen-studio"
$Url = "https://download.tizen.org/sdk/Installer/tizen-studio_6.0/web-cli_Tizen_Studio_6.0_windows-64.exe"

New-Item -ItemType Directory -Force -Path $Cache | Out-Null

if (-not (Test-Path $Installer)) {
    Write-Host "Downloading Tizen Studio CLI (~266 MB)..."
    curl.exe -L -o $Installer $Url
}

if (Test-Path (Join-Path $InstallRoot "package-manager\package-manager-cli.exe")) {
    Write-Host "Tizen Studio CLI already at $InstallRoot"
    exit 0
}

Write-Host "Installing to $InstallRoot ..."
cmd /c "`"$Installer`" --accept-license --no-java-check `"$InstallRoot`""
if (-not (Test-Path (Join-Path $InstallRoot "package-manager\package-manager-cli.exe"))) {
    Write-Error "Install failed. Try running this script from an elevated PowerShell."
}
Write-Host "Base install OK. Next (Admin): .\scripts\install-tizen-tv-sdk.ps1"
