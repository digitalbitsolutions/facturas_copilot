param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[0-9a-fA-F-]{36}$')]
    [string]$TenantId,

    [string]$HostName = 'integramente.sharepoint.com',
    [string]$SitePath = '/sites/facturas'
)

$ErrorActionPreference = 'Stop'
$clientId = '14d82eec-204b-4c2f-b7e8-296a70dab67e' # Microsoft Graph Command Line Tools
$scope = @('openid', 'profile', 'https://graph.microsoft.com/Sites.Manage.All') -join ' '

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

$headers = @{ Authorization = "Bearer $($token.access_token)"; 'Content-Type' = 'application/json' }
$site = Invoke-RestMethod -Headers $headers -Uri "https://graph.microsoft.com/v1.0/sites/$HostName`:$SitePath"
$existing = (Invoke-RestMethod -Headers $headers -Uri "https://graph.microsoft.com/v1.0/sites/$($site.id)/lists?%24select=id,displayName").value

$definitions = @(
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
