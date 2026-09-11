param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[0-9a-fA-F-]{36}$')]
    [string]$TenantId,

    [string]$HostName = 'integramente.sharepoint.com',
    [string]$SitePath = '/sites/facturas',

    [switch]$UseAzureCliToken,

    [string]$AccessToken
)

$ErrorActionPreference = 'Stop'
$clientId = '14d82eec-204b-4c2f-b7e8-296a70dab67e' # Microsoft Graph Command Line Tools
$scope = @('openid', 'profile', 'https://graph.microsoft.com/Sites.Manage.All') -join ' '

$device = $null
$token = $null
if ($AccessToken) {
    $token = @{ access_token = $AccessToken }
}
elseif ($UseAzureCliToken) {
    $azCommand = Get-Command az -ErrorAction SilentlyContinue
    if (-not $azCommand -and (Test-Path "$env:ProgramFiles\Microsoft SDKs\Azure\CLI2\wbin\az.cmd")) {
        $azCommand = Get-Item "$env:ProgramFiles\Microsoft SDKs\Azure\CLI2\wbin\az.cmd"
    }
    if (-not $azCommand) { throw 'Azure CLI was not found. Remove -UseAzureCliToken to use device authentication.' }
    $azExe = if ($azCommand.Source) { $azCommand.Source } else { $azCommand.FullName }
    $token = @{ access_token = (& $azExe account get-access-token --resource-type ms-graph --query accessToken -o tsv) }
    if (-not $token.access_token) { throw 'Azure CLI did not return a Microsoft Graph token.' }
}
else {
$device = Invoke-RestMethod -Method Post `
    -Uri "https://login.microsoftonline.com/$TenantId/oauth2/v2.0/devicecode" `
    -ContentType 'application/x-www-form-urlencoded' `
    -Body @{ client_id = $clientId; scope = $scope }
Write-Output "AUTH_URL=$($device.verification_uri)"
Write-Output "USER_CODE=$($device.user_code)"
Write-Output "EXPIRES_SECONDS=$($device.expires_in)"

$deadline = (Get-Date).AddSeconds($device.expires_in)
$interval = [int]$device.interval
$token = $null
while ((Get-Date) -lt $deadline -and -not $token) {
    Start-Sleep -Seconds $interval
    try {
        $token = Invoke-RestMethod -Method Post `
            -Uri "https://login.microsoftonline.com/$TenantId/oauth2/v2.0/token" `
            -ContentType 'application/x-www-form-urlencoded' `
            -Body @{ grant_type = 'urn:ietf:params:oauth:grant-type:device_code'; client_id = $clientId; device_code = $device.device_code }
    }
    catch {
        $payload = $null
        try { $payload = $_.ErrorDetails.Message | ConvertFrom-Json } catch { }
        if ($payload.error -eq 'slow_down') { $interval += 5 }
        elseif ($payload.error -ne 'authorization_pending') { throw }
    }
}
if (-not $token) { throw 'Device authentication expired.' }
}

$headers = @{ Authorization = "Bearer $($token.access_token)"; 'Content-Type' = 'application/json' }
$site = Invoke-RestMethod -Headers $headers -Uri "https://graph.microsoft.com/v1.0/sites/$HostName`:$SitePath"
$existing = (Invoke-RestMethod -Headers $headers -Uri "https://graph.microsoft.com/v1.0/sites/$($site.id)/lists?%24select=id,displayName").value

$definitions = @(
    @{
        displayName = 'ProcesosFacturas'
        columns = @(
            @{ name = 'ProcessId'; indexed = $true; enforceUniqueValues = $true; text = @{} }
            @{ name = 'Estado'; choice = @{ choices = @('received','classified','extracted','validated','archived','completed','diverted','review_required','resolved','discarded','failed') } }
            @{ name = 'MessageId'; text = @{} }
            @{ name = 'AttachmentId'; text = @{} }
            @{ name = 'Remitente'; text = @{} }
            @{ name = 'Recibido'; dateTime = @{ format = 'dateTime' } }
            @{ name = 'ArchivoOriginal'; text = @{} }
            @{ name = 'ContentType'; text = @{} }
            @{ name = 'FlowRunId'; text = @{} }
            @{ name = 'DocumentKind'; choice = @{ choices = @('invoice','bank_settlement','other') } }
            @{ name = 'ClassificationConfidence'; number = @{ decimalPlaces = 'automatic' } }
            @{ name = 'ClassificationReasons'; text = @{ allowMultipleLines = $true } }
            @{ name = 'DuplicateKey'; text = @{} }
            @{ name = 'FinalFilename'; text = @{} }
            @{ name = 'DocumentUrl'; text = @{ allowMultipleLines = $true } }
            @{ name = 'ExceptionCode'; text = @{} }
            @{ name = 'ExceptionReason'; text = @{ allowMultipleLines = $true } }
            @{ name = 'ExceptionRetryable'; boolean = @{} }
            @{ name = 'ValidationIssues'; text = @{ allowMultipleLines = $true } }
            @{ name = 'UpdatedAt'; dateTime = @{ format = 'dateTime' } }
        )
    },
    @{
        displayName = 'RegistroFacturas'
        columns = @(
            @{ name = 'ProcessId'; indexed = $true; enforceUniqueValues = $true; text = @{} }
            @{ name = 'DuplicateKey'; indexed = $true; enforceUniqueValues = $true; text = @{} }
            @{ name = 'Proveedor'; text = @{} }
            @{ name = 'NIFProveedor'; text = @{} }
            @{ name = 'NumeroFactura'; text = @{} }
            @{ name = 'FechaFactura'; dateTime = @{ format = 'dateOnly' } }
            @{ name = 'FechaVencimiento'; dateTime = @{ format = 'dateOnly' } }
            @{ name = 'BaseImponible'; number = @{ decimalPlaces = 'automatic' } }
            @{ name = 'IVA'; number = @{ decimalPlaces = 'automatic' } }
            @{ name = 'Total'; number = @{ decimalPlaces = 'automatic' } }
            @{ name = 'Moneda'; text = @{} }
            @{ name = 'DocumentoUrl'; text = @{ allowMultipleLines = $true } }
            @{ name = 'Remitente'; text = @{} }
            @{ name = 'Recibido'; dateTime = @{ format = 'dateTime' } }
        )
    },
    @{
        displayName = 'MaestroProveedores'
        columns = @(
            @{ name = 'CodigoProveedor'; text = @{} }
            @{ name = 'RazonSocial'; text = @{} }
            @{ name = 'NIF'; text = @{} }
            @{ name = 'Aliases'; text = @{ allowMultipleLines = $true } }
            @{ name = 'Activo'; boolean = @{} }
        )
    },
    @{
        displayName = 'Excepciones'
        columns = @(
            @{ name = 'Codigo'; text = @{} }
            @{ name = 'EntidadTipo'; choice = @{ choices = @('Factura','Movimiento','Lote','Flujo') } }
            @{ name = 'EntidadId'; text = @{} }
            @{ name = 'Estado'; choice = @{ choices = @('Abierta','EnRevision','Resuelta','Descartada') } }
            @{ name = 'Motivo'; text = @{ allowMultipleLines = $true } }
            @{ name = 'Reintentable'; boolean = @{} }
            @{ name = 'CorrelationId'; text = @{} }
            @{ name = 'Responsable'; text = @{} }
            @{ name = 'AccionResolucion'; choice = @{ choices = @('request_replacement','discard_non_invoice','retry_after_correction','update_supplier_and_resubmit','confirm_duplicate','retry_after_technical_fix') } }
            @{ name = 'ResultadoResolucion'; text = @{ allowMultipleLines = $true } }
            @{ name = 'FechaDeteccion'; dateTime = @{ format = 'dateTime' } }
            @{ name = 'FechaResolucion'; dateTime = @{ format = 'dateTime' } }
        )
    },
    @{
        displayName = 'ConfiguracionConciliacion'
        columns = @(
            @{ name = 'Clave'; text = @{} }
            @{ name = 'Valor'; text = @{} }
            @{ name = 'Version'; text = @{} }
            @{ name = 'Activo'; boolean = @{} }
            @{ name = 'Descripcion'; text = @{ allowMultipleLines = $true } }
        )
    },
    @{
        displayName = 'ImportacionesBancarias'
        columns = @(
            @{ name = 'LoteId'; text = @{} }
            @{ name = 'ArchivoOrigen'; text = @{} }
            @{ name = 'HashOrigen'; text = @{} }
            @{ name = 'Estado'; choice = @{ choices = @('Importado','Error') } }
            @{ name = 'FilasLeidas'; number = @{ decimalPlaces = 'none' } }
            @{ name = 'MovimientosImportados'; number = @{ decimalPlaces = 'none' } }
            @{ name = 'FechaImportacion'; dateTime = @{ format = 'dateTime' } }
        )
    },
    @{
        displayName = 'MovimientosBancarios'
        columns = @(
            @{ name = 'MovimientoId'; text = @{} }
            @{ name = 'LoteId'; text = @{} }
            @{ name = 'ArchivoOrigen'; text = @{} }
            @{ name = 'FechaMovimiento'; dateTime = @{ format = 'dateOnly' } }
            @{ name = 'FechaValor'; dateTime = @{ format = 'dateOnly' } }
            @{ name = 'Concepto'; text = @{ allowMultipleLines = $true } }
            @{ name = 'ImporteMenor'; number = @{ decimalPlaces = 'none' } }
            @{ name = 'Moneda'; text = @{} }
            @{ name = 'Referencia'; text = @{} }
            @{ name = 'Contraparte'; text = @{} }
            @{ name = 'Huella'; text = @{} }
            @{ name = 'Estado'; choice = @{ choices = @('Importado','EnRevision','Conciliado') } }
        )
    }
)

$created = @()
$alreadyPresent = @()
foreach ($definition in $definitions) {
    if ($existing | Where-Object { $_.displayName -eq $definition.displayName }) {
        $alreadyPresent += $definition.displayName
        continue
    }
    $body = @{ displayName = $definition.displayName; list = @{ template = 'genericList' }; columns = $definition.columns } | ConvertTo-Json -Depth 10
    Invoke-RestMethod -Method Post -Headers $headers -Uri "https://graph.microsoft.com/v1.0/sites/$($site.id)/lists" -Body $body | Out-Null
    $created += $definition.displayName
}

[pscustomobject]@{ siteUrl = $site.webUrl; created = $created; alreadyPresent = $alreadyPresent } | ConvertTo-Json -Depth 4

# The access token exists only in this process and is discarded on exit.
