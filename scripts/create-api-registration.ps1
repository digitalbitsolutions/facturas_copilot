param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[0-9a-fA-F-]{36}$')]
    [string]$TenantId,

    [string]$DisplayName = 'facturas-copilot-api-dev'
)

$ErrorActionPreference = 'Stop'
$clientId = '14d82eec-204b-4c2f-b7e8-296a70dab67e' # Microsoft Graph Command Line Tools
$scope = @(
    'openid'
    'profile'
    'https://graph.microsoft.com/Application.ReadWrite.All'
) -join ' '

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
$filterName = [System.Uri]::EscapeDataString("displayName eq '$DisplayName'")
$existing = (Invoke-RestMethod -Headers $headers -Uri "https://graph.microsoft.com/v1.0/applications?%24filter=$filterName").value
if ($existing.Count -gt 1) { throw "More than one application is named '$DisplayName'." }

if ($existing.Count -eq 1) {
    $application = $existing[0]
    $created = $false
}
else {
    $application = Invoke-RestMethod -Method Post -Headers $headers -Uri 'https://graph.microsoft.com/v1.0/applications' -Body (@{
        displayName = $DisplayName
        signInAudience = 'AzureADMyOrg'
    } | ConvertTo-Json)
    $created = $true

    $scopeId = [guid]::NewGuid().Guid
    $api = @{
        requestedAccessTokenVersion = 2
        oauth2PermissionScopes = @(@{
            id = $scopeId
            adminConsentDescription = 'Access the Facturas Copilot API on behalf of the signed-in user.'
            adminConsentDisplayName = 'Access Facturas Copilot API'
            isEnabled = $true
            type = 'User'
            userConsentDescription = 'Access Facturas Copilot API on your behalf.'
            userConsentDisplayName = 'Access Facturas Copilot API'
            value = 'access_as_user'
        })
    }
    $patch = @{
        identifierUris = @("api://$($application.appId)")
        api = $api
    } | ConvertTo-Json -Depth 8
    Invoke-RestMethod -Method Patch -Headers $headers -Uri "https://graph.microsoft.com/v1.0/applications/$($application.id)" -Body $patch | Out-Null
    $application = Invoke-RestMethod -Headers $headers -Uri "https://graph.microsoft.com/v1.0/applications/$($application.id)"
}

[pscustomobject]@{
    created = $created
    displayName = $application.displayName
    applicationObjectId = $application.id
    clientId = $application.appId
    identifierUris = $application.identifierUris
} | ConvertTo-Json -Depth 5

# No client secret is created and the access token is discarded on exit.
