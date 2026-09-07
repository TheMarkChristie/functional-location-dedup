# Installs the compiled Functional Location De-duplicator plugin into XrmToolBox.
# XrmToolBox already ships WebView2 + the Dataverse SDK, so we copy ONLY our plugin dll
# and its bundled app HTML to avoid assembly version conflicts.
#
# The HTML name is deliberately unique. Every plugin dll installs flat into Plugins, so all
# WebView2 tools share the one Plugins\app folder - a generic index.html there is silently
# overwritten by whichever tool installs last. Never write app\index.html from here.
$ErrorActionPreference = 'Stop'
$src = Join-Path $PSScriptRoot 'FunctionalLocationMerge\bin\Release\net48'
$dst = Join-Path $env:APPDATA 'MscrmTools\XrmToolBox\Plugins'
if (-not (Test-Path $src)) { throw "Build first: dotnet build -c Release  ($src not found)" }
if (-not (Test-Path $dst)) { throw "XrmToolBox Plugins folder not found: $dst" }

# XrmToolBox holds loaded plugin assemblies open, so skip any file that is already identical -
# during development only the HTML usually changes, and that alone does not need a restart.
function Copy-IfChanged([string] $from, [string] $to) {
    if ((Test-Path $to) -and
        (Get-FileHash $from).Hash -eq (Get-FileHash $to).Hash) {
        Write-Host "  unchanged  $(Split-Path $to -Leaf)" -ForegroundColor DarkGray
        return
    }
    Copy-Item $from $to -Force
    Write-Host "  updated    $(Split-Path $to -Leaf)" -ForegroundColor Green
}

Copy-IfChanged (Join-Path $src 'FunctionalLocationMerge.dll') (Join-Path $dst 'FunctionalLocationMerge.dll')
New-Item -ItemType Directory -Force (Join-Path $dst 'app') | Out-Null
Copy-IfChanged (Join-Path $src 'app\functional-location-dedup.html') (Join-Path $dst 'app\functional-location-dedup.html')

Write-Host "Installed FunctionalLocationMerge.dll + app\functional-location-dedup.html to:`n  $dst" -ForegroundColor Green
Write-Host "Restart XrmToolBox -> tool 'Functional Location De-duplicator'." -ForegroundColor Yellow
