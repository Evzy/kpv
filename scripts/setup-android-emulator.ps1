# Installs Android emulator + API 34 image and creates AVD "kpv_api34" (run once).
$ErrorActionPreference = "Stop"
$Sdk = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { Join-Path $env:LOCALAPPDATA "Android\Sdk" }
if (-not (Test-Path $Sdk)) {
    Write-Error "Android SDK not found at $Sdk. Install Android Studio or cmdline-tools first."
}
$Sm = Join-Path $Sdk "cmdline-tools\latest\bin\sdkmanager.bat"
$Avd = Join-Path $Sdk "cmdline-tools\latest\bin\avdmanager.bat"
if (-not (Test-Path $Sm)) {
    Write-Error "sdkmanager not found. Open Android Studio → SDK Manager → install Command-line Tools."
}
Write-Host "Accepting SDK licenses..."
cmd /c "echo y | `"$Sm`" --licenses" | Out-Null
Write-Host "Installing emulator + system image (may take several minutes)..."
& $Sm "emulator" "platform-tools" "system-images;android-34;google_apis;x86_64"
Write-Host "Creating AVD kpv_api34..."
cmd /c "echo no | `"$Avd`" create avd -n kpv_api34 -k `"system-images;android-34;google_apis;x86_64`" -d pixel_6 --force"
Write-Host "Done. Start with: scripts\start-android-emulator.ps1"
