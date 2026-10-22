param([string]$Path = (Join-Path $PSScriptRoot "KPV.wgt"))
$ErrorActionPreference = "Stop"
if (-not (Test-Path $Path)) { throw "Not found: $Path" }
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead($Path)
$entries = $zip.Entries | ForEach-Object { $_.FullName }
$zip.Dispose()
Write-Host "Archive: $Path ($((Get-Item $Path).Length) bytes)"
$entries | ForEach-Object { Write-Host "  $_" }
if ($entries | Where-Object { $_ -match '\\' }) { Write-Host "FAIL: backslashes in paths" -ForegroundColor Red }
else { Write-Host "OK: forward-slash paths" -ForegroundColor Green }
if ($entries -notcontains "config.xml") { Write-Host "FAIL: missing config.xml" -ForegroundColor Red }
