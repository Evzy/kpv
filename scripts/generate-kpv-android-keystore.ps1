# One-time: creates a normal app signing keystore (NOT a CA cert — the old Weekday Fuel shared key broke installs on many phones).
param(
  [string]$Out = (Join-Path $PSScriptRoot "..\app\kpv-ci.keystore"),
  [string]$Alias = "kpv",
  [string]$StorePass = "",
  [string]$Dname = "CN=KPV Debug, OU=Mobile, O=Evzy, C=AU"
)

if (-not $StorePass) {
  Write-Error "Pass -StorePass (PKCS12 uses the same password for store and key)."
  exit 1
}

if (Test-Path $Out) {
  Write-Error "Already exists: $Out — delete manually if you intend to replace it."
  exit 1
}

keytool -genkeypair -v -storetype PKCS12 -keystore $Out -alias $Alias `
  -keyalg RSA -keysize 2048 -validity 10000 `
  -storepass $StorePass -dname $Dname

Write-Host "Created $Out"
Write-Host "Verify no CA flag:"
keytool -list -v -keystore $Out -storepass $StorePass -alias $Alias | Select-String "BasicConstraints|Owner:"

$b64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes($Out))
Write-Host ""
Write-Host "Set GitHub Actions secrets on Evzy/kpv (store pass / alias kpv):"
Write-Host "  gh secret set KPV_SHARED_DEBUG_KEYSTORE_B64 -R Evzy/kpv"
Write-Host "  (paste base64 below when prompted)"
Write-Host $b64
