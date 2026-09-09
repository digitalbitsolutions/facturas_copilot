param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[0-9a-fA-F-]{36}$')]
    [string]$TenantId,

    [string]$UserPrincipalName = 'demo@integramente.onmicrosoft.com'
)

$ErrorActionPreference = 'Stop'
$clientId = '14d82eec-204b-4c2f-b7e8-296a70dab67e' # Microsoft Graph Command Line Tools
$scope = @(
    'openid'
    'profile'
    'https://graph.microsoft.com/Organization.Read.All'
    'https://graph.microsoft.com/User.Read.All'
    'https://graph.microsoft.com/LicenseAssignment.ReadWrite.All'
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
$encodedUpn = [System.Uri]::EscapeDataString($UserPrincipalName)
$user = Invoke-RestMethod -Headers $headers `
    -Uri "https://graph.microsoft.com/v1.0/users/$($encodedUpn)?%24select=id,userPrincipalName,assignedLicenses"
$skus = (Invoke-RestMethod -Headers $headers `
    -Uri 'https://graph.microsoft.com/v1.0/subscribedSkus?$select=skuId,skuPartNumber,capabilityStatus').value

$required = @('O365_BUSINESS_PREMIUM', 'MICROSOFT_365_COPILOT_FOR_BUSINESS')
$available = $skus | Where-Object { $_.skuPartNumber -in $required -and $_.capabilityStatus -eq 'Enabled' }
if ($available.Count -ne $required.Count) { throw 'One or more required SKUs are unavailable or disabled.' }

$assignedSkuIds = @($user.assignedLicenses | ForEach-Object { $_.skuId.ToString() })
$missing = @($available | Where-Object { $_.skuId.ToString() -notin $assignedSkuIds })
if ($missing.Count -gt 0) {
    $body = @{ addLicenses = @($missing | ForEach-Object { @{ skuId = $_.skuId } }); removeLicenses = @() } | ConvertTo-Json -Depth 4
    Invoke-RestMethod -Method Post -Headers $headers -Uri "https://graph.microsoft.com/v1.0/users/$($user.id)/assignLicense" -Body $body | Out-Null
}

[pscustomobject]@{
    user = $user.userPrincipalName
    assignedNow = @($missing | ForEach-Object { $_.skuPartNumber })
    alreadyAssigned = @($available | Where-Object { $_.skuId.ToString() -in $assignedSkuIds } | ForEach-Object { $_.skuPartNumber })
} | ConvertTo-Json -Depth 4

# The access token exists only in this process and is discarded on exit.
