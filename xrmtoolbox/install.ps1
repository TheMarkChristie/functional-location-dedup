# Installs the compiled Functional Location De-duplicator plugin into XrmToolBox.
# XrmToolBox already ships WebView2 + the Dataverse SDK, so we copy ONLY our plugin dll
# and its bundled app/ (the shared HTML) to avoid assembly version conflicts.
$ErrorActionPreference = 'Stop'
$src = Join-Path $PSScriptRoot 'FunctionalLocationMerge\bin\Release\net48'
$dst = Join-Path $env:APPDATA 'MscrmTools\XrmToolBox\Plugins'
if (-not (Test-Path $src)) { throw "Build first: dotnet build -c Release  ($src not found)" }
if (-not (Test-Path $dst)) { throw "XrmToolBox Plugins folder not found: $dst" }

Copy-Item (Join-Path $src 'FunctionalLocationMerge.dll') $dst -Force
New-Item -ItemType Directory -Force (Join-Path $dst 'app') | Out-Null
Copy-Item (Join-Path $src 'app\index.html') (Join-Path $dst 'app\index.html') -Force

Write-Host "Installed FunctionalLocationMerge.dll + app\index.html to:`n  $dst" -ForegroundColor Green
Write-Host "Restart XrmToolBox -> tool 'Functional Location De-duplicator'." -ForegroundColor Yellow
