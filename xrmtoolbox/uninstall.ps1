# Removes the Functional Location De-duplicator plugin from XrmToolBox.
#
# Deletes ONLY the files this tool owns:
#   Plugins\FunctionalLocationMerge.dll
#   Plugins\app\functional-location-dedup.html
#
# It must NEVER delete Plugins\app\index.html or any other file in Plugins\app - every
# XrmToolBox plugin dll installs flat into Plugins, so all WebView2 tools share that one
# app folder and those files belong to other tools.
$ErrorActionPreference = 'Stop'
$dst = Join-Path $env:APPDATA 'MscrmTools\XrmToolBox\Plugins'
if (-not (Test-Path $dst)) { throw "XrmToolBox Plugins folder not found: $dst" }

$own = @(
    (Join-Path $dst 'FunctionalLocationMerge.dll'),
    (Join-Path $dst 'app\functional-location-dedup.html')
)

foreach ($f in $own) {
    if (Test-Path $f) {
        Remove-Item $f -Force
        Write-Host "  removed    $(Split-Path $f -Leaf)" -ForegroundColor Green
    } else {
        Write-Host "  not found  $(Split-Path $f -Leaf)" -ForegroundColor DarkGray
    }
}

# Only tidy the shared app folder away if WE left it empty - other tools live there too.
$appDir = Join-Path $dst 'app'
if ((Test-Path $appDir) -and -not (Get-ChildItem $appDir -Force)) {
    Remove-Item $appDir -Force
    Write-Host "  removed    empty app folder" -ForegroundColor DarkGray
}

Write-Host "Uninstalled Functional Location De-duplicator from:`n  $dst" -ForegroundColor Green
Write-Host "Restart XrmToolBox to drop the loaded assembly." -ForegroundColor Yellow
