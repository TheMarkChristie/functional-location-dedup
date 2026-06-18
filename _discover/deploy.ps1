# Deploy prx3_FunctionalLocationMerge.html as an HTML web resource to the customer sandbox.
# Reuses the cached token from discover.ps1 (re-run discover.ps1 to refresh if 401).
$ErrorActionPreference = 'Stop'
$Org = 'https://org1d1cdc26.crm4.dynamics.com'; $Api = "$Org/api/data/v9.2"
$TokenFile = Join-Path $PSScriptRoot 'token.cust.json'
$HtmlPath  = Resolve-Path (Join-Path $PSScriptRoot '..\webresource\prx3_FunctionalLocationMerge.html')

if (-not (Test-Path $TokenFile)) { throw "No cached token - run discover.ps1 first." }
$tok = (Get-Content $TokenFile -Raw | ConvertFrom-Json).token
$Hdr = @{ Authorization="Bearer $tok"; 'OData-MaxVersion'='4.0'; 'OData-Version'='4.0';
        Accept='application/json'; 'Content-Type'='application/json; charset=utf-8' }

# pick a valid publisher prefix (prefer prx3)
$pubs = (Invoke-RestMethod -Method Get -Uri "$Api/publishers?`$select=customizationprefix" -Headers $Hdr).value |
        Where-Object { $_.customizationprefix -and $_.customizationprefix -notin @('none','') }
$prefix = ($pubs | Where-Object { $_.customizationprefix -eq 'prx3' } | Select-Object -First 1).customizationprefix
if (-not $prefix) { $prefix = ($pubs | Sort-Object { $_.customizationprefix.Length } | Select-Object -First 1).customizationprefix }
$name = "${prefix}_FunctionalLocationMerge"
Write-Host ("Web resource name: {0}" -f $name) -ForegroundColor Cyan

$bytes = [IO.File]::ReadAllBytes($HtmlPath); $b64 = [Convert]::ToBase64String($bytes)
Write-Host ("HTML size: {0:N0} bytes" -f $bytes.Length)
$bb = [Text.Encoding]::UTF8.GetBytes(((@{ name=$name; displayname='Functional Location De-duplicator';
        webresourcetype=1; content=$b64 }) | ConvertTo-Json))

$existing = (Invoke-RestMethod -Method Get -Uri "$Api/webresourceset?`$select=webresourceid&`$filter=name eq '$name'" -Headers $Hdr).value
if ($existing.Count -gt 0) {
  $id = $existing[0].webresourceid
  Invoke-RestMethod -Method Patch -Uri "$Api/webresourceset($id)" -Headers $Hdr -Body $bb | Out-Null
  Write-Host ("Updated {0}" -f $id) -ForegroundColor Green
} else {
  $resp = Invoke-WebRequest -Method Post -Uri "$Api/webresourceset" -Headers $Hdr -Body $bb
  $id = ($resp.Headers['OData-EntityId'] -replace '.*\(([0-9a-f-]+)\).*','$1')
  Write-Host ("Created {0}" -f $id) -ForegroundColor Green
}
$pub = @{ ParameterXml = "<importexportxml><webresources><webresource>$id</webresource></webresources></importexportxml>" } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri "$Api/PublishXml" -Headers $Hdr -Body ([Text.Encoding]::UTF8.GetBytes($pub)) | Out-Null
Write-Host "Published." -ForegroundColor Green
Write-Host ("`nOpen:`n  {0}/WebResources/{1}" -f $Org, $name) -ForegroundColor Yellow
