# Starts headless-ish emulator kpv_api34 if none is booted.
$ErrorActionPreference = "Stop"
$Sdk = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { Join-Path $env:LOCALAPPDATA "Android\Sdk" }
$Adb = Join-Path $Sdk "platform-tools\adb.exe"
$Emu = Join-Path $Sdk "emulator\emulator.exe"
if (-not (Test-Path $Emu)) {
    Write-Error "Emulator missing. Run scripts\setup-android-emulator.ps1 first."
}
$booted = (cmd /c "`"$Adb`" devices 2>nul") | Select-String "emulator-" | Select-String "device$"
if ($booted) {
    Write-Host "Emulator already running: $($booted.Line)"
    exit 0
}
Write-Host "Starting kpv_api34 (first boot can take 2-3 min)..."
Start-Process -FilePath $Emu -ArgumentList @("-avd", "kpv_api34", "-no-snapshot-save", "-gpu", "swiftshader_indirect") -WindowStyle Minimized
$deadline = (Get-Date).AddMinutes(8)
do {
    Start-Sleep -Seconds 5
    $ready = cmd /c "`"$Adb`" shell getprop sys.boot_completed 2>nul"
    if ($ready -match "1") {
        Write-Host "Emulator booted."
        exit 0
    }
} while ((Get-Date) -lt $deadline)
Write-Error "Emulator did not finish booting within 8 minutes."
