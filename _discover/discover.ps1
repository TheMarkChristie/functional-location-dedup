# Read-only discovery for the customer sandbox Functional Locations.
# Confirms Street1/Postcode field names, lists relationships referencing FL,
# and reports duplicate groups by Street1 + Postcode. NO writes.
$ErrorActionPreference = 'Stop'
$Org    = 'https://org1d1cdc26.crm4.dynamics.com'
$Api    = "$Org/api/data/v9.2"
$Client = '51f81489-12ee-4a9e-aaae-a2591f45987d'   # public client, supports device code
$TokenFile = Join-Path $PSScriptRoot 'token.cust.json'

# ---- auth (reuse cached token if WhoAmI still works, else device code) ----
function Headers { @{
  Authorization='Bearer '+$Global:Tok; 'OData-MaxVersion'='4.0'; 'OData-Version'='4.0';
  Accept='application/json'; 'Content-Type'='application/json; charset=utf-8' } }
function Get-Dv([string]$p){ Invoke-RestMethod -Method Get -Uri "$Api/$p" -Headers (Headers) }

$Global:Tok = $null
if (Test-Path $TokenFile) {
  try {
    $Global:Tok = (Get-Content $TokenFile -Raw | ConvertFrom-Json).token
    $null = Get-Dv 'WhoAmI'
    Write-Host 'Reusing cached token.' -ForegroundColor DarkGray
  } catch { $Global:Tok = $null }
}
if (-not $Global:Tok) {
  Import-Module MSAL.PS -ErrorAction Stop
  $scope = "$Org/.default"
  try { $t = Get-MsalToken -ClientId $Client -Scopes $scope -Silent -ErrorAction Stop }
  catch { $t = Get-MsalToken -ClientId $Client -Scopes $scope -DeviceCode }
  $Global:Tok = $t.AccessToken
  @{ token=$t.AccessToken; expires=$t.ExpiresOn.UtcDateTime.ToString('o') } |
    ConvertTo-Json | Set-Content $TokenFile -Encoding utf8
  Write-Host ("Token for {0}" -f $t.Account.Username) -ForegroundColor Green
}

$who = Get-Dv 'WhoAmI'
Write-Host ("WhoAmI OK  UserId={0}" -f $who.UserId) -ForegroundColor Green

# ---- 1. FL string/memo attributes (street1 / postcode candidates) ----
Write-Host "`n===== FL string/memo attributes =====" -ForegroundColor Cyan
$attrs = (Get-Dv ("EntityDefinitions(LogicalName='msdyn_functionallocation')/Attributes?" +
  "`$select=LogicalName,AttributeType,DisplayName&`$filter=(AttributeType eq 'String' or AttributeType eq 'Memo')")).value
$attrs | Sort-Object LogicalName | ForEach-Object {
  "{0,-45} {1}" -f $_.LogicalName, ($_.DisplayName.UserLocalizedLabel.Label)
}

# best-guess field mapping (match logical name OR display label)
function Guess($needles){
  ($attrs | Where-Object {
     $n=$_.LogicalName.ToLower(); $l=([string]$_.DisplayName.UserLocalizedLabel.Label).ToLower()
     ($needles | Where-Object { $n -like "*$_*" -or $l -like "*$_*" })
   } | Select-Object -First 1).LogicalName }
$street1  = Guess @('street 1','address1')
$postcode = Guess @('postal','postcode','zip')
Write-Host ("`nGuessed Street1 = {0}" -f $street1) -ForegroundColor Yellow
Write-Host ("Guessed Postcode = {0}" -f $postcode) -ForegroundColor Yellow

# ---- 2. relationships referencing FL ----
Write-Host "`n===== Relationships that REFERENCE functional location =====" -ForegroundColor Cyan
$def = Get-Dv ("EntityDefinitions(LogicalName='msdyn_functionallocation')?`$select=LogicalName&" +
  "`$expand=OneToManyRelationships(`$select=ReferencingEntity,ReferencingAttribute,SchemaName)," +
  "ManyToManyRelationships(`$select=SchemaName,Entity1LogicalName,Entity2LogicalName)")
Write-Host ("N:1 lookups into FL: {0}" -f $def.OneToManyRelationships.Count) -ForegroundColor Yellow
$def.OneToManyRelationships | Sort-Object ReferencingEntity | ForEach-Object {
  "  {0,-35} .{1}" -f $_.ReferencingEntity, $_.ReferencingAttribute }
Write-Host ("N:N relationships: {0}" -f $def.ManyToManyRelationships.Count) -ForegroundColor Yellow
$def.ManyToManyRelationships | ForEach-Object { "  {0}  ({1} <-> {2})" -f $_.SchemaName,$_.Entity1LogicalName,$_.Entity2LogicalName }

# ---- 3. load all FLs + group by street1 + postcode ----
if ($street1 -and $postcode) {
  Write-Host "`n===== Duplicate groups (Street1 + Postcode) =====" -ForegroundColor Cyan
  $sel = @('msdyn_functionallocationid','msdyn_name','createdon',$street1,$postcode) | Select-Object -Unique
  $all=@(); $url = ("msdyn_functionallocations?`$select={0}" -f ($sel -join ','))
  do {
    $page = Get-Dv $url
    $all += $page.value
    $next = $page.'@odata.nextLink'
    $url = if ($next) { $next.Substring($next.IndexOf('/api/data/v9.2/')+15) } else { $null }
  } while ($url)
  Write-Host ("Total functional locations: {0}" -f $all.Count)

  $norm = { param($v) if ($null -eq $v){''} else { ($v.ToString().Trim().ToLower() -replace '\s+',' ') } }
  function Report($label,$grps,$showField){
    $rec = ($grps | Measure-Object Count -Sum).Sum
    Write-Host ("`n[{0}] groups={1}  records={2}  deletions={3}" -f $label,$grps.Count,$rec,($rec-$grps.Count)) -ForegroundColor Green
    $grps | Sort-Object Count -Descending | Select-Object -First 10 | ForEach-Object {
      $f=$_.Group[0]; "   x{0,-4} {1} / {2}" -f $_.Count, $f.$street1, $f.$postcode }
  }
  $blankPc = ($all | Where-Object { (& $norm $_.$postcode) -eq '' }).Count
  Write-Host ("`nFLs with BLANK postcode: {0} of {1}" -f $blankPc, $all.Count) -ForegroundColor Yellow

  # A) Street1 + Postcode, both blank excluded (loose - current app default)
  $gA = $all | Group-Object { (& $norm $_.$street1) + '|||' + (& $norm $_.$postcode) } |
        Where-Object { $_.Name -ne '|||' -and $_.Count -gt 1 }
  Report 'A loose: Street1+Postcode (skip only if BOTH blank)' $gA

  # B) require BOTH Street1 AND Postcode non-blank (safe set)
  $gB = $all | Where-Object { (& $norm $_.$street1) -ne '' -and (& $norm $_.$postcode) -ne '' } |
        Group-Object { (& $norm $_.$street1) + '|||' + (& $norm $_.$postcode) } |
        Where-Object { $_.Count -gt 1 }
  Report 'B safe: Street1 AND Postcode both populated' $gB

  # C) tighter: Street1 + Postcode + Name (both addr non-blank)
  $gC = $all | Where-Object { (& $norm $_.$street1) -ne '' -and (& $norm $_.$postcode) -ne '' } |
        Group-Object { (& $norm $_.$street1)+'|||'+(& $norm $_.$postcode)+'|||'+(& $norm $_.msdyn_name) } |
        Where-Object { $_.Count -gt 1 }
  Report 'C tighter: Street1 + Postcode + Name' $gC
} else {
  Write-Host "`nCould not guess Street1/Postcode fields - inspect the attribute list above." -ForegroundColor Red
}
Write-Host "`nDONE (read-only)." -ForegroundColor Green
