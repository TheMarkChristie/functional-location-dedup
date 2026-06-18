# Deploy the full CSP-safe web resource set (libs + app + css + html) and publish.
$ErrorActionPreference = 'Stop'
$Org = 'https://org1d1cdc26.crm4.dynamics.com'; $Api = "$Org/api/data/v9.2"
$Root = Resolve-Path (Join-Path $PSScriptRoot '..\webresource')
$tok = (Get-Content (Join-Path $PSScriptRoot 'token.cust.json') -Raw | ConvertFrom-Json).token
$Hdr = @{ Authorization="Bearer $tok"; 'OData-MaxVersion'='4.0'; 'OData-Version'='4.0';
          Accept='application/json'; 'Content-Type'='application/json; charset=utf-8' }

# name, file, type (1=HTML, 2=CSS, 3=JS)
$items = @(
  @{ n='prx3_react.js';                     f='lib\react.js';      t=3; d='React 18 (UMD)' }
  @{ n='prx3_reactdom.js';                  f='lib\react-dom.js';  t=3; d='ReactDOM 18 (UMD)' }
  @{ n='prx3_htm.js';                       f='lib\htm.js';        t=3; d='htm (UMD)' }
  @{ n='prx3_flmerge.css';                  f='prx3_flmerge.css';  t=2; d='FL De-dup styles' }
  @{ n='prx3_flmerge.js';                   f='prx3_flmerge.js';   t=3; d='FL De-dup app' }
  @{ n='prx3_FunctionalLocationMerge.html'; f='prx3_FunctionalLocationMerge.html'; t=1; d='Functional Location De-duplicator' }
)

$ids = @()
foreach ($it in $items) {
  $path = Join-Path $Root $it.f
  $bytes = [IO.File]::ReadAllBytes($path)
  $b64 = [Convert]::ToBase64String($bytes)
  $bb = [Text.Encoding]::UTF8.GetBytes(((@{ name=$it.n; displayname=$it.d; webresourcetype=$it.t; content=$b64 }) | ConvertTo-Json))
  $existing = (Invoke-RestMethod -Method Get -Uri "$Api/webresourceset?`$select=webresourceid&`$filter=name eq '$($it.n)'" -Headers $Hdr).value
  if ($existing.Count -gt 0) {
    $id = $existing[0].webresourceid
    Invoke-RestMethod -Method Patch -Uri "$Api/webresourceset($id)" -Headers $Hdr -Body $bb | Out-Null
    Write-Host ("Updated  {0,-38} {1,8:N0} bytes" -f $it.n, $bytes.Length) -ForegroundColor DarkGreen
  } else {
    $resp = Invoke-WebRequest -Method Post -Uri "$Api/webresourceset" -Headers $Hdr -Body $bb
    $id = ($resp.Headers['OData-EntityId'] -replace '.*\(([0-9a-f-]+)\).*','$1')
    Write-Host ("Created  {0,-38} {1,8:N0} bytes" -f $it.n, $bytes.Length) -ForegroundColor Green
  }
  $ids += $id
}

$xml = "<importexportxml><webresources>" + (($ids | ForEach-Object { "<webresource>$_</webresource>" }) -join '') + "</webresources></importexportxml>"
$pub = @{ ParameterXml = $xml } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri "$Api/PublishXml" -Headers $Hdr -Body ([Text.Encoding]::UTF8.GetBytes($pub)) | Out-Null
Write-Host "`nPublished all." -ForegroundColor Green
Write-Host ("Open:`n  {0}/WebResources/prx3_FunctionalLocationMerge" -f $Org) -ForegroundColor Yellow
