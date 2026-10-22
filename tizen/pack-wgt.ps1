# Pack KPV.wgt with forward-slash paths (required by Tizen; PowerShell Compress-Archive uses backslashes).
$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $here

$required = @("config.xml", "index.html", "icon.png")
foreach ($f in $required) {
    if (-not (Test-Path $f)) {
        node generate-icon.js
        break
    }
}
foreach ($f in $required) {
    if (-not (Test-Path $f)) { throw "Missing $f" }
}

$files = @(
    @{ Path = "config.xml"; Entry = "config.xml" },
    @{ Path = "index.html"; Entry = "index.html" },
    @{ Path = "icon.png"; Entry = "icon.png" },
    @{ Path = "css\style.css"; Entry = "css/style.css" },
    @{ Path = "js\site.js"; Entry = "js/site.js" },
    @{ Path = "js\catalog.js"; Entry = "js/catalog.js" },
    @{ Path = "js\player.js"; Entry = "js/player.js" },
    @{ Path = "js\app.js"; Entry = "js/app.js" }
)

$out = Join-Path $here "KPV.wgt"
$tmp = Join-Path $here "KPV.zip"
if (Test-Path $tmp) { Remove-Item $tmp -Force }
if (Test-Path $out) { Remove-Item $out -Force }

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$zip = [System.IO.Compression.ZipFile]::Open($tmp, [System.IO.Compression.ZipArchiveMode]::Create)
try {
    foreach ($item in $files) {
        $full = Join-Path $here $item.Path
        if (-not (Test-Path $full)) { throw "Missing $($item.Path)" }
        $entry = $zip.CreateEntry($item.Entry, [System.IO.Compression.CompressionLevel]::Optimal)
        $inStream = [System.IO.File]::OpenRead($full)
        try {
            $outStream = $entry.Open()
            try { $inStream.CopyTo($outStream) } finally { $outStream.Dispose() }
        } finally { $inStream.Dispose() }
    }
} finally {
    $zip.Dispose()
}

Move-Item -Force $tmp $out
Write-Host "Created $out"
Write-Host "NOTE: Retail Samsung TVs need a SIGNED .wgt (author-signature.xml inside). Run verify-wgt.ps1"
