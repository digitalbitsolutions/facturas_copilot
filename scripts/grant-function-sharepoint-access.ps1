param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[0-9a-fA-F-]{36}$')]
    [string]$TenantId,

    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[0-9a-fA-F-]{36}$')]
    [string]$FunctionPrincipalId,

    [Parameter(Mandatory = $true)]
    [string]$SharePointHostname,

    [Parameter(Mandatory = $true)]
    [string]$SitePath,

    [ValidateSet('read', 'write')]
    [string]$Role = 'write'
)

$ErrorActionPreference = 'Stop'
$graphCliClientId = '14d82eec-204b-4c2f-b7e8-296a70dab67e' # Microsoft Graph Command Line Tools
$scope = @(
    'openid'
    'profile'
    'https://graph.microsoft.com/AppRoleAssignment.ReadWrite.All'
    'https://graph.microsoft.com/Sites.FullControl.All'
) -join ' '

$device = Invoke-RestMethod -Method Post `
    -Uri "https://login.microsoftonline.com/$TenantId/oauth2/v2.0/devicecode" `
    -ContentType 'application/x-www-form-urlencoded' `
    -Body @{ client_id = $graphCliClientId; scope = $scope }
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
            -Body @{ grant_type = 'urn:ietf:params:oauth:grant-type:device_code'; client_id = $graphCliClientId; device_code = $device.device_code }
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
$graphServicePrincipal = Invoke-RestMethod -Headers $headers -Uri 'https://graph.microsoft.com/v1.0/servicePrincipals(appId=''00000003-0000-0000-c000-000000000000'')'
$sitesSelected = @($graphServicePrincipal.appRoles | Where-Object { $_.value -eq 'Sites.Selected' -and $_.allowedMemberTypes -contains 'Application' })
if ($sitesSelected.Count -ne 1) { throw 'Microsoft Graph Sites.Selected application role was not found.' }

$functionPrincipal = Invoke-RestMethod -Headers $headers -Uri "https://graph.microsoft.com/v1.0/servicePrincipals/$FunctionPrincipalId"
$assignments = (Invoke-RestMethod -Headers $headers -Uri "https://graph.microsoft.com/v1.0/servicePrincipals/$FunctionPrincipalId/appRoleAssignments").value
if (-not ($assignments | Where-Object { $_.resourceId -eq $graphServicePrincipal.id -and $_.appRoleId -eq $sitesSelected[0].id })) {
    $assignment = @{ principalId = $FunctionPrincipalId; resourceId = $graphServicePrincipal.id; appRoleId = $sitesSelected[0].id } | ConvertTo-Json
    Invoke-RestMethod -Method Post -Headers $headers -Uri "https://graph.microsoft.com/v1.0/servicePrincipals/$FunctionPrincipalId/appRoleAssignments" -Body $assignment | Out-Null
}

$normalizedPath = $SitePath.Trim('/')
$site = Invoke-RestMethod -Headers $headers -Uri "https://graph.microsoft.com/v1.0/sites/${SharePointHostname}:/$normalizedPath"
$permissions = (Invoke-RestMethod -Headers $headers -Uri "https://graph.microsoft.com/v1.0/sites/$($site.id)/permissions").value
$existing = @($permissions | Where-Object { $_.grantedToIdentitiesV2.application.id -eq $functionPrincipal.appId })
if ($existing.Count -eq 0) {
    $body = @{ roles = @($Role); grantedToIdentities = @(@{ application = @{ id = $functionPrincipal.appId; displayName = $functionPrincipal.displayName } }) } | ConvertTo-Json -Depth 6
    Invoke-RestMethod -Method Post -Headers $headers -Uri "https://graph.microsoft.com/v1.0/sites/$($site.id)/permissions" -Body $body | Out-Null
}
elseif ($existing[0].roles -notcontains $Role) {
    throw "The managed identity already has a different site role: $($existing[0].roles -join ', '). Change it deliberately in SharePoint."
}

[pscustomobject]@{
    functionPrincipalId = $functionPrincipal.id
    managedIdentityClientId = $functionPrincipal.appId
    siteId = $site.id
    siteWebUrl = $site.webUrl
    role = $Role
    sitesSelectedGranted = $true
} | ConvertTo-Json -Depth 5

# The access token is discarded on exit; no secret or certificate is created.
