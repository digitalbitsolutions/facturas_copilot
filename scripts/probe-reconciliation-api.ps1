param(
    [Parameter(Mandatory = $true)][string]$TenantId,
    [Parameter(Mandatory = $true)][string]$FunctionBaseUrl,
    [Parameter(Mandatory = $true)][string]$ApiClientId,
    [string]$StatusPath
)

$ErrorActionPreference = 'Stop'
trap { if ($StatusPath) { "ERROR=$($_.Exception.Message)" | Add-Content -LiteralPath $StatusPath -Encoding utf8 }; throw }
$clientId = '04b07795-8ddb-461a-bbee-02f9e1bf7b46'
$device = Invoke-RestMethod -Method Post -Uri "https://login.microsoftonline.com/$TenantId/oauth2/v2.0/devicecode" -ContentType 'application/x-www-form-urlencoded' -Body @{ client_id = $clientId; scope = "openid profile api://$ApiClientId/access_as_user" }
$status = "AUTH_LABEL=API: prueba de contrato sin efectos`nAUTH_URL=$($device.verification_uri)`nUSER_CODE=$($device.user_code)`nEXPIRES_SECONDS=$($device.expires_in)"
Write-Host $status
if ($StatusPath) { $status | Set-Content -LiteralPath $StatusPath -Encoding utf8 }

$deadline = (Get-Date).AddSeconds($device.expires_in)
while ((Get-Date) -lt $deadline) {
    Start-Sleep -Seconds ([int]$device.interval)
    try { $token = (Invoke-RestMethod -Method Post -Uri "https://login.microsoftonline.com/$TenantId/oauth2/v2.0/token" -ContentType 'application/x-www-form-urlencoded' -Body @{ grant_type = 'urn:ietf:params:oauth:grant-type:device_code'; client_id = $clientId; device_code = $device.device_code }).access_token; break }
    catch { if ($_.ErrorDetails.Message -notmatch 'authorization_pending|slow_down') { throw } }
}
if (-not $token) { throw 'API device authorization expired' }
if ($StatusPath) { 'AUTH_GRANTED=API contract probe' | Add-Content -LiteralPath $StatusPath -Encoding utf8 }

try {
    Invoke-WebRequest -Method Post -Headers @{ Authorization = "Bearer $token"; 'Content-Type' = 'application/json' } -Uri "$FunctionBaseUrl/api/bank/reconciliations/propose" -Body '{}' -UseBasicParsing | Out-Null
    throw 'The invalid request unexpectedly succeeded'
} catch {
    $response = $_.Exception.Response
    if (-not $response) { throw }
    $reader = [IO.StreamReader]::new($response.GetResponseStream())
    $body = $reader.ReadToEnd(); $reader.Dispose()
    "RESULT_STATUS=$([int]$response.StatusCode) RESULT_BODY=$body" | Write-Output
    if ($StatusPath) { "RESULT_STATUS=$([int]$response.StatusCode) RESULT_BODY=$body" | Add-Content -LiteralPath $StatusPath -Encoding utf8 }
}
