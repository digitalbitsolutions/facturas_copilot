param(
    [Parameter(Mandatory = $true)][string]$TenantId,
    [Parameter(Mandatory = $true)][string]$ResourceGroup,
    [Parameter(Mandatory = $true)][string]$FunctionName,
    [string]$StatusPath
)

$ErrorActionPreference = 'Stop'
$clientId = '04b07795-8ddb-461a-bbee-02f9e1bf7b46' # Azure CLI public client
$device = Invoke-RestMethod -Method Post -Uri "https://login.microsoftonline.com/$TenantId/oauth2/v2.0/devicecode" -ContentType 'application/x-www-form-urlencoded' -Body @{ client_id = $clientId; scope = 'https://management.azure.com/user_impersonation' }
"AUTH_LABEL=Azure Resource Manager: lectura de ajustes M365 no secretos`nAUTH_URL=$($device.verification_uri)`nUSER_CODE=$($device.user_code)`nEXPIRES_SECONDS=$($device.expires_in)" | Tee-Object -Variable status | Write-Host
if ($StatusPath) { $status | Set-Content -LiteralPath $StatusPath -Encoding utf8 }

$deadline = (Get-Date).AddSeconds($device.expires_in)
while ((Get-Date) -lt $deadline) {
    Start-Sleep -Seconds ([int]$device.interval)
    try {
        $token = (Invoke-RestMethod -Method Post -Uri "https://login.microsoftonline.com/$TenantId/oauth2/v2.0/token" -ContentType 'application/x-www-form-urlencoded' -Body @{ grant_type = 'urn:ietf:params:oauth:grant-type:device_code'; client_id = $clientId; device_code = $device.device_code }).access_token
        break
    } catch { if ($_.ErrorDetails.Message -notmatch 'authorization_pending|slow_down') { throw } }
}
if (-not $token) { throw 'Azure Resource Manager device authorization expired' }

$headers = @{ Authorization = "Bearer $token" }
$subscription = (Invoke-RestMethod -Headers $headers -Uri 'https://management.azure.com/subscriptions?api-version=2022-12-01').value | Select-Object -First 1
if (-not $subscription) { throw 'No Azure subscription is available to this account' }
$uri = "https://management.azure.com/subscriptions/$($subscription.subscriptionId)/resourceGroups/$ResourceGroup/providers/Microsoft.Web/sites/$FunctionName/config/appsettings/list?api-version=2024-04-01"
$settings = (Invoke-RestMethod -Method Post -Headers $headers -Uri $uri).properties
[pscustomobject]@{
    subscriptionId = $subscription.subscriptionId
    functionName = $FunctionName
    settings = [ordered]@{
        M365_SHAREPOINT_SITE_ID = $settings.M365_SHAREPOINT_SITE_ID
        M365_RECONCILIATIONS_LIST = $settings.M365_RECONCILIATIONS_LIST
        M365_BANK_MOVEMENTS_LIST = $settings.M365_BANK_MOVEMENTS_LIST
    }
} | ConvertTo-Json -Depth 4
