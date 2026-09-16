param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[0-9a-fA-F-]{36}$')]
    [string]$TenantId,

    [string]$HostName = 'integramente.sharepoint.com',
    [string]$SitePath = '/sites/facturas',
    [string]$DriveId = 'b!5jrFItukHkmFsOl2xVnIkJuxt8evc-NCiytn9wNt7VsGAUobTrWkQLJNsSY1Ct6p'
)

$ErrorActionPreference = 'Stop'
$token = az account get-access-token --tenant $TenantId --resource-type ms-graph --query accessToken -o tsv
if (-not $token) { throw 'Azure CLI did not return a Microsoft Graph token.' }
$headers = @{ Authorization = "Bearer $token" }
$site = Invoke-RestMethod -Headers $headers -Uri "https://graph.microsoft.com/v1.0/sites/$HostName`:$SitePath"
$lists = (Invoke-RestMethod -Headers $headers -Uri "https://graph.microsoft.com/v1.0/sites/$($site.id)/lists?%24select=id,displayName").value

function Get-ListItems([string]$name) {
    $list = $lists | Where-Object { $_.displayName -eq $name } | Select-Object -First 1
    if (-not $list) { throw "SharePoint list '$name' was not found" }
    return (Invoke-RestMethod -Headers $headers -Uri "https://graph.microsoft.com/v1.0/sites/$($site.id)/lists/$($list.id)/items?%24expand=fields").value
}

$imports = @(Get-ListItems 'ImportacionesPrevisiones')
$forecasts = @(Get-ListItems 'PrevisionesPagos')
function Get-Files([string]$folder) {
    $items = (Invoke-RestMethod -Headers $headers -Uri "https://graph.microsoft.com/v1.0/drives/${DriveId}/root:/$folder`:/children?%24select=name").value
    return @($items | ForEach-Object { $_.name } | Where-Object { $_ })
}

$result = [ordered]@{
    importBatches = $imports.Count
    forecasts = $forecasts.Count
    reviewForecasts = @($forecasts | Where-Object { $_.fields.RequiereRevision -eq $true } | ForEach-Object { $_.fields.PrevisionId })
    paidForecasts = @($forecasts | Where-Object { $_.fields.Estado -in @('Pagado', 'Pagada') } | ForEach-Object { $_.fields.PrevisionId })
    incomingFiles = @(Get-Files 'PrevisionesPagos')
    processedFiles = @(Get-Files 'ProcesadosPrevisiones')
    errorFiles = @(Get-Files 'ErroresPrevisiones')
}
$result | ConvertTo-Json -Depth 4

if ($imports.Count -ne 1 -or $forecasts.Count -ne 2 -or $result.reviewForecasts -notcontains 'PREV-0003' -or $result.paidForecasts.Count -ne 0 -or $result.processedFiles -notcontains 'Prevision_Pagos_importacion_compatible.xlsx' -or $result.incomingFiles.Count -ne 0 -or $result.errorFiles.Count -ne 0) {
    throw 'Payment forecast acceptance checks have not passed yet.'
}
