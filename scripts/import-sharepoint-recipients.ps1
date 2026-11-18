param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[0-9a-fA-F-]{36}$')]
    [string]$TenantId,

    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[a-z0-9-]+\.sharepoint\.com$')]
    [string]$HostName,

    [Parameter(Mandatory = $true)]
    [ValidatePattern('^/sites/[^/?#]+$')]
    [string]$SitePath
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
$lists = (Invoke-RestMethod -Headers $headers -Uri "https://graph.microsoft.com/v1.0/sites/$($site.id)/lists?%24select=id,displayName").value
$recipientList = $lists | Where-Object { $_.displayName -eq 'MaestroReceptores' } | Select-Object -First 1
if (-not $recipientList) { throw 'La lista MaestroReceptores no existe. Ejecute primero provision-sharepoint-lists.ps1.' }

$recipients = @(
    @{ CodigoReceptor = 'TREO_2025'; RazonSocial = 'TREO 2025, SL'; NIF = 'B67915157'; Aliases = 'TREO 2025; TREO 2025 SL'; Activo = $true },
    @{ CodigoReceptor = 'DENTALIS_DICTUM'; RazonSocial = 'DENTALIS DICTUM, SL'; NIF = 'B55641500'; Aliases = 'DENTALIS DICTUM; DENTALIS DICTUM SL; SMILE-ESPARREGUERA'; Activo = $true },
    @{ CodigoReceptor = 'DENTAL_RIPOLL'; RazonSocial = 'DENTAL RIPOLL, SL'; NIF = 'B16796930'; Aliases = 'DENTAL RIPOLL; DENTAL RIPOLL SL; ST ANTONI'; Activo = $true },
    @{ CodigoReceptor = 'DENTAL_CLINIC_REUS'; RazonSocial = 'DENTAL CLINIC REUS, SL'; NIF = 'B44833002'; Aliases = 'DENTAL CLINIC REUS; DENTAL CLINIC REUS SL; SMILE-ELPRAT'; Activo = $true },
    @{ CodigoReceptor = 'DC_MOLINS'; RazonSocial = 'DC MOLINS, SL'; NIF = 'B16896318'; Aliases = 'DC MOLINS; DC MOLINS SL; TERRASSA'; Activo = $true }
)

$existing = (Invoke-RestMethod -Headers $headers -Uri "https://graph.microsoft.com/v1.0/sites/$($site.id)/lists/$($recipientList.id)/items?%24expand=fields(%24select=CodigoReceptor,RazonSocial,NIF,Aliases,Activo)").value
$created = @()
$updated = @()
foreach ($recipient in $recipients) {
    $fields = $recipient | ConvertTo-Json -Depth 4
    $match = $existing | Where-Object { $_.fields.NIF -eq $recipient.NIF } | Select-Object -First 1
    if ($match) {
        Invoke-RestMethod -Method Patch -Headers $headers -Uri "https://graph.microsoft.com/v1.0/sites/$($site.id)/lists/$($recipientList.id)/items/$($match.id)/fields" -Body $fields | Out-Null
        $updated += $recipient.CodigoReceptor
    }
    else {
        Invoke-RestMethod -Method Post -Headers $headers -Uri "https://graph.microsoft.com/v1.0/sites/$($site.id)/lists/$($recipientList.id)/items" -Body (@{ fields = $recipient } | ConvertTo-Json -Depth 4) | Out-Null
        $created += $recipient.CodigoReceptor
    }
}

[pscustomobject]@{ siteUrl = $site.webUrl; list = 'MaestroReceptores'; created = $created; updated = $updated } | ConvertTo-Json -Depth 4
