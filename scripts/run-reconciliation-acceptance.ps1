param(
    [Parameter(Mandatory = $true)][ValidatePattern('^[0-9a-fA-F-]{36}$')][string]$TenantId,
    [Parameter(Mandatory = $true)][string]$SiteId,
    [Parameter(Mandatory = $true)][ValidatePattern('^https://[^/]+$')][string]$FunctionBaseUrl,
    [Parameter(Mandatory = $true)][ValidatePattern('^[0-9a-fA-F-]{36}$')][string]$ApiClientId,
    [Parameter(Mandatory = $true)][string]$Responsible,
    [string]$SiteHostName = 'integramente.sharepoint.com',
    [string]$SitePath = '/sites/facturas',
    [string]$StatusPath
)

$ErrorActionPreference = 'Stop'
trap {
    if ($StatusPath) {
        $detail = $_.ErrorDetails.Message
        if (-not $detail -and $_.Exception.Response) {
            try {
                $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
                $detail = $reader.ReadToEnd()
                $reader.Dispose()
            } catch { }
        }
        if ($detail) { "ERROR=$($_.Exception.Message) DETAIL=$detail" | Add-Content -LiteralPath $StatusPath -Encoding utf8 }
        else { "ERROR=$($_.Exception.Message)" | Add-Content -LiteralPath $StatusPath -Encoding utf8 }
    }
    throw
}
$graphClientId = '14d82eec-204b-4c2f-b7e8-296a70dab67e' # Microsoft Graph Command Line Tools
$azureCliClientId = '04b07795-8ddb-461a-bbee-02f9e1bf7b46'

function Get-DeviceToken([string]$ClientId, [string]$Scope, [string]$Label) {
    $device = Invoke-RestMethod -Method Post -Uri "https://login.microsoftonline.com/$TenantId/oauth2/v2.0/devicecode" -ContentType 'application/x-www-form-urlencoded' -Body @{ client_id = $ClientId; scope = $Scope }
    Write-Host "AUTH_LABEL=$Label"
    Write-Host "AUTH_URL=$($device.verification_uri)"
    Write-Host "USER_CODE=$($device.user_code)"
    Write-Host "EXPIRES_SECONDS=$($device.expires_in)"
    if ($StatusPath) {
        "AUTH_LABEL=$Label`nAUTH_URL=$($device.verification_uri)`nUSER_CODE=$($device.user_code)`nEXPIRES_SECONDS=$($device.expires_in)" | Set-Content -LiteralPath $StatusPath -Encoding utf8
    }
    $deadline = (Get-Date).AddSeconds($device.expires_in); $interval = [int]$device.interval
    while ((Get-Date) -lt $deadline) {
        Start-Sleep -Seconds $interval
        try {
            $token = (Invoke-RestMethod -Method Post -Uri "https://login.microsoftonline.com/$TenantId/oauth2/v2.0/token" -ContentType 'application/x-www-form-urlencoded' -Body @{ grant_type = 'urn:ietf:params:oauth:grant-type:device_code'; client_id = $ClientId; device_code = $device.device_code }).access_token
            if ($StatusPath) { "AUTH_GRANTED=$Label" | Add-Content -LiteralPath $StatusPath -Encoding utf8 }
            return $token
        }
        catch {
            $payload = $null; try { $payload = $_.ErrorDetails.Message | ConvertFrom-Json } catch { }
            if ($payload.error -eq 'authorization_pending') { continue }
            if ($payload.error -eq 'slow_down') { $interval += 5; continue }
            throw
        }
    }
    throw "$Label device authentication expired"
}

function GraphHeaders([string]$Token) { @{ Authorization = "Bearer $Token"; 'Content-Type' = 'application/json' } }
function GraphUrl([string]$Path) { "https://graph.microsoft.com/v1.0/sites/$resolvedSiteId/$Path" }
function ApiHeaders([string]$Token) { @{ Authorization = "Bearer $Token"; 'Content-Type' = 'application/json' } }
function Set-Phase([string]$Phase) { if ($StatusPath) { "PHASE=$Phase" | Add-Content -LiteralPath $StatusPath -Encoding utf8 } }

$graphToken = Get-DeviceToken $graphClientId 'openid profile https://graph.microsoft.com/Sites.Manage.All' 'Graph: crear y comprobar evidencia SharePoint'
$graphHeaders = GraphHeaders $graphToken
Set-Phase 'resolve_sharepoint_site'
$resolvedSite = Invoke-RestMethod -Headers $graphHeaders -Uri "https://graph.microsoft.com/v1.0/sites/$SiteHostName`:$SitePath"
$resolvedSiteId = $resolvedSite.id
if (-not $resolvedSiteId) { throw 'SharePoint site resolution did not return an ID' }
Set-Phase 'read_sharepoint_lists'
$lists = (Invoke-RestMethod -Headers $graphHeaders -Uri (GraphUrl 'lists?%24select=id,displayName')).value
$movements = $lists | Where-Object { $_.displayName -eq 'MovimientosBancarios' } | Select-Object -First 1
$reconciliations = $lists | Where-Object { $_.displayName -eq 'Conciliaciones' } | Select-Object -First 1
if (-not $movements -or -not $reconciliations) { throw 'MovimientosBancarios or Conciliaciones was not found' }
Set-Phase 'verify_graph_item_reads'
# Verify the exact collection URIs used by the reconciliation store before calling the Function.
Invoke-RestMethod -Headers $graphHeaders -Uri (GraphUrl "lists/$($reconciliations.id)/items?%24expand=fields") | Out-Null
Invoke-RestMethod -Headers $graphHeaders -Uri (GraphUrl "lists/$($movements.id)/items?%24expand=fields") | Out-Null

function New-Movement([string]$CaseId) {
    $movementId = "$CaseId-$([guid]::NewGuid().ToString('N').Substring(0, 12))"
    $body = @{ fields = @{ Title = $movementId; MovimientoId = $movementId; LoteId = "acceptance-$CaseId"; ArchivoOrigen = 'acceptance-synthetic'; FechaMovimiento = '2026-09-17'; FechaValor = '2026-09-17'; Concepto = "Acceptance $CaseId synthetic movement"; ImporteMenor = -10000; Moneda = 'EUR'; Referencia = $CaseId; Contraparte = 'Proveedor sintético'; Huella = $movementId; Estado = 'Importado' } } | ConvertTo-Json -Depth 5
    Invoke-RestMethod -Method Post -Headers $graphHeaders -Uri (GraphUrl "lists/$($movements.id)/items") -Body $body | Out-Null
    return $movementId
}
function Read-Movement([string]$MovementId) {
    $result = (Invoke-RestMethod -Headers $graphHeaders -Uri (GraphUrl "lists/$($movements.id)/items?%24expand=fields")).value | Where-Object { $_.fields.MovimientoId -eq $MovementId }
    if ($result.Count -ne 1) { throw "Expected one movement for $MovementId" }; return $result[0]
}
function Read-Reconciliation([string]$ReconciliationId) { Invoke-RestMethod -Headers $graphHeaders -Uri (GraphUrl "lists/$($reconciliations.id)/items/$ReconciliationId?%24expand=fields") }

Set-Phase 'request_api_token'
$apiToken = Get-DeviceToken $azureCliClientId "openid profile api://$ApiClientId/access_as_user" 'API: ejecutar CA-17 a CA-19'
$apiHeaders = ApiHeaders $apiToken
function Propose([string]$MovementId, [string]$CaseId) {
    $body = @{ proposals = @(@{ movementId = $MovementId; classification = 'review'; candidates = @(@{ invoiceId = "invoice-$CaseId-a"; score = 70; factors = @() }, @{ invoiceId = "invoice-$CaseId-b"; score = 69; factors = @() }); requiresHumanReview = $true; reason = 'Synthetic ambiguous acceptance case' }) } | ConvertTo-Json -Depth 8
    return (Invoke-RestMethod -Method Post -Headers $apiHeaders -Uri "$FunctionBaseUrl/api/bank/reconciliations/propose" -Body $body).proposals[0]
}
function Decide([string]$ReconciliationId, [string]$Action, [string]$Result) {
    $body = @{ reconciliationId = $ReconciliationId; responsible = $Responsible; action = $Action; result = $Result } | ConvertTo-Json
    return Invoke-RestMethod -Method Post -Headers $apiHeaders -Uri "$FunctionBaseUrl/api/bank/reconciliations/decide" -Body $body
}

$evidence = @()
Set-Phase 'execute_ca17'
Set-Phase 'ca17_create_movement'; $movement17 = New-Movement 'CA17'; Set-Phase 'ca17_propose'; $proposal17 = Propose $movement17 'CA17'; Set-Phase 'ca17_read_reconciliation'; $record17 = Read-Reconciliation $proposal17.reconciliationId; Set-Phase 'ca17_read_movement'; $move17 = Read-Movement $movement17
if ($proposal17.state -ne 'PendienteRevision' -or $record17.fields.Estado -ne 'PendienteRevision' -or $move17.fields.Estado -ne 'EnRevision') { throw 'CA-17 verification failed' }
$evidence += @{ criterion = 'CA-17'; movementId = $movement17; reconciliationId = $proposal17.reconciliationId; result = 'PendienteRevision'; movementState = $move17.fields.Estado }

Set-Phase 'execute_ca18'
Set-Phase 'ca18_create_movement'; $movement18 = New-Movement 'CA18'; Set-Phase 'ca18_propose'; $proposal18 = Propose $movement18 'CA18'; Set-Phase 'ca18_decide'; $decision18 = Decide $proposal18.reconciliationId 'confirm_match' 'Synthetic reference and amount verified'; Set-Phase 'ca18_read_reconciliation'; $record18 = Read-Reconciliation $proposal18.reconciliationId; Set-Phase 'ca18_read_movement'; $move18 = Read-Movement $movement18
if ($decision18.state -ne 'Conciliada' -or $record18.fields.Decision -ne 'confirm_match' -or $record18.fields.Responsable -ne $Responsible -or $move18.fields.Estado -ne 'Conciliado') { throw 'CA-18 verification failed' }
$evidence += @{ criterion = 'CA-18'; movementId = $movement18; reconciliationId = $proposal18.reconciliationId; result = $record18.fields.Estado; decision = $record18.fields.Decision; movementState = $move18.fields.Estado }

Set-Phase 'execute_ca19'
Set-Phase 'ca19_create_movement'; $movement19 = New-Movement 'CA19'; Set-Phase 'ca19_propose'; $proposal19 = Propose $movement19 'CA19'; Set-Phase 'ca19_decide'; $decision19 = Decide $proposal19.reconciliationId 'reject_match' 'Synthetic candidate rejected after review'; Set-Phase 'ca19_read_reconciliation'; $record19 = Read-Reconciliation $proposal19.reconciliationId; Set-Phase 'ca19_read_movement'; $move19 = Read-Movement $movement19
if ($decision19.state -ne 'Rechazada' -or $record19.fields.Decision -ne 'reject_match' -or $record19.fields.Responsable -ne $Responsible -or $move19.fields.Estado -ne 'EnRevision') { throw 'CA-19 verification failed' }
$evidence += @{ criterion = 'CA-19'; movementId = $movement19; reconciliationId = $proposal19.reconciliationId; result = $record19.fields.Estado; decision = $record19.fields.Decision; movementState = $move19.fields.Estado }

[pscustomobject]@{ executedAt = (Get-Date).ToUniversalTime().ToString('o'); environment = $FunctionBaseUrl; evidence = $evidence } | ConvertTo-Json -Depth 6
