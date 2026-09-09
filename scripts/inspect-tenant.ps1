param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[0-9a-fA-F-]{36}$')]
    [string]$TenantId
)

$ErrorActionPreference = 'Stop'
$clientId = '14d82eec-204b-4c2f-b7e8-296a70dab67e' # Microsoft Graph Command Line Tools
$scope = @(
    'openid'
    'profile'
    'https://graph.microsoft.com/User.Read'
    'https://graph.microsoft.com/User.Read.All'
    'https://graph.microsoft.com/Organization.Read.All'
    'https://graph.microsoft.com/Directory.Read.All'
    'https://graph.microsoft.com/Sites.Read.All'
) -join ' '

$device = Invoke-RestMethod `
    -Method Post `
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
        $token = Invoke-RestMethod `
            -Method Post `
            -Uri "https://login.microsoftonline.com/$TenantId/oauth2/v2.0/token" `
            -ContentType 'application/x-www-form-urlencoded' `
            -Body @{
                grant_type = 'urn:ietf:params:oauth:grant-type:device_code'
                client_id = $clientId
                device_code = $device.device_code
            }
    }
    catch {
        $payload = $null
        try { $payload = $_.ErrorDetails.Message | ConvertFrom-Json } catch { }
        if ($payload.error -eq 'slow_down') {
            $interval += 5
        }
        elseif ($payload.error -ne 'authorization_pending') {
            throw
        }
    }
}

if (-not $token) { throw 'Device authentication expired.' }

$headers = @{ Authorization = "Bearer $($token.access_token)" }
$organization = Invoke-RestMethod `
    -Headers $headers `
    -Uri 'https://graph.microsoft.com/v1.0/organization?$select=id,displayName,verifiedDomains'
$licenses = Invoke-RestMethod `
    -Headers $headers `
    -Uri 'https://graph.microsoft.com/v1.0/subscribedSkus?$select=skuPartNumber,consumedUnits,prepaidUnits,capabilityStatus'
$administrator = Invoke-RestMethod `
    -Headers $headers `
    -Uri 'https://graph.microsoft.com/v1.0/users/demo@integramente.onmicrosoft.com?$select=id,displayName,userPrincipalName,accountEnabled,assignedLicenses,assignedPlans'
$sharePointRoot = $null
try {
    $sharePointRoot = Invoke-RestMethod -Headers $headers -Uri 'https://graph.microsoft.com/v1.0/sites/root?$select=id,displayName,webUrl'
}
catch {
    $sharePointRoot = [pscustomobject]@{ error = 'SharePoint root site is unavailable or cannot be read.' }
}

[pscustomobject]@{
    organization = $organization.value
    licenses = $licenses.value
    administrator = $administrator
    sharePointRoot = $sharePointRoot
} | ConvertTo-Json -Depth 8

# The access token exists only in this process and is discarded on exit.
