# Runs SettingsActivity Espresso tests on a booted emulator or USB device.
$ErrorActionPreference = "Stop"
$Root = Split-Path $PSScriptRoot -Parent
$Sdk = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { Join-Path $env:LOCALAPPDATA "Android\Sdk" }
$Adb = Join-Path $Sdk "platform-tools\adb.exe"
$devices = & $Adb devices 2>$null | Select-String "device$"
if (-not $devices) {
    Write-Host "No device — starting emulator..."
    & (Join-Path $PSScriptRoot "start-android-emulator.ps1")
}
Push-Location $Root
try {
    .\gradlew.bat :app:connectedDebugAndroidTest --no-daemon --stacktrace
} finally {
    Pop-Location
}
