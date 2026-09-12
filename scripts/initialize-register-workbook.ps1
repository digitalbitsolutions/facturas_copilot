param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[0-9a-fA-F-]{36}$')]
    [string]$TenantId,

    [string]$HostName = 'integramente.sharepoint.com',
    [string]$SitePath = '/sites/facturas',
    [string]$WorkbookPath = 'Configuracion/RegistroFacturas.xlsx'
)

$ErrorActionPreference = 'Stop'
$clientId = '14d82eec-204b-4c2f-b7e8-296a70dab67e' # Microsoft Graph Command Line Tools
$scope = @('openid', 'profile', 'https://graph.microsoft.com/Files.ReadWrite.All', 'https://graph.microsoft.com/Sites.ReadWrite.All') -join ' '

function Get-DeviceToken {
    param([string]$DirectoryId, [string]$AppId, [string]$RequestedScope)
    $device = Invoke-RestMethod -Method Post `
        -Uri "https://login.microsoftonline.com/$DirectoryId/oauth2/v2.0/devicecode" `
        -ContentType 'application/x-www-form-urlencoded' `
        -Body @{ client_id = $AppId; scope = $RequestedScope }
    Write-Host "AUTH_URL=$($device.verification_uri)"
    Write-Host "USER_CODE=$($device.user_code)"
    Write-Host "EXPIRES_SECONDS=$($device.expires_in)"
    $deadline = (Get-Date).AddSeconds($device.expires_in)
    $interval = [int]$device.interval
    while ((Get-Date) -lt $deadline) {
        Start-Sleep -Seconds $interval
        try {
            return Invoke-RestMethod -Method Post `
                -Uri "https://login.microsoftonline.com/$DirectoryId/oauth2/v2.0/token" `
                -ContentType 'application/x-www-form-urlencoded' `
                -Body @{ grant_type = 'urn:ietf:params:oauth:grant-type:device_code'; client_id = $AppId; device_code = $device.device_code }
        }
        catch {
            $payload = $null
            try { $payload = $_.ErrorDetails.Message | ConvertFrom-Json } catch { }
            if ($payload.error -eq 'slow_down') { $interval += 5 }
            elseif ($payload.error -ne 'authorization_pending') { throw }
        }
    }
    throw 'Device authentication expired.'
}

function Get-ColumnLetter {
    param([int]$Number)
    $result = ''
    while ($Number -gt 0) {
        $Number--
        $result = [char](65 + ($Number % 26)) + $result
        $Number = [math]::Floor($Number / 26)
    }
    return $result
}

$token = Get-DeviceToken -DirectoryId $TenantId -AppId $clientId -RequestedScope $scope
$headers = @{ Authorization = "Bearer $($token.access_token)"; 'Content-Type' = 'application/json' }
$site = Invoke-RestMethod -Headers $headers -Uri "https://graph.microsoft.com/v1.0/sites/$HostName`:$SitePath"
$drive = Invoke-RestMethod -Headers $headers -Uri "https://graph.microsoft.com/v1.0/sites/$($site.id)/drive"
$encodedPath = [System.Uri]::EscapeDataString($WorkbookPath).Replace('%2F', '/')
try {
    $workbook = Invoke-RestMethod -Headers $headers -Uri "https://graph.microsoft.com/v1.0/drives/$($drive.id)/root:/$encodedPath"
}
catch {
    $fileName = Split-Path -Leaf $WorkbookPath
    $matches = @()
    $pendingFolders = @('root')
    while ($pendingFolders.Count -gt 0) {
        $folder = $pendingFolders[0]
        if ($pendingFolders.Count -eq 1) { $pendingFolders = @() } else { $pendingFolders = @($pendingFolders[1..($pendingFolders.Count - 1)]) }
        $childrenUri = if ($folder -eq 'root') {
            "https://graph.microsoft.com/v1.0/drives/$($drive.id)/root/children?%24select=id,name,webUrl,file,folder"
        } else {
            "https://graph.microsoft.com/v1.0/drives/$($drive.id)/items/$folder/children?%24select=id,name,webUrl,file,folder"
        }
        $children = (Invoke-RestMethod -Headers $headers -Uri $childrenUri).value
        $matches += @($children | Where-Object { $_.name -eq $fileName -and $null -ne $_.file })
        $pendingFolders += @($children | Where-Object { $null -ne $_.folder } | ForEach-Object { $_.id })
    }
    if ($matches.Count -ne 1) { throw "Expected one workbook named '$fileName', found $($matches.Count)." }
    $workbook = $matches[0]
}
$session = Invoke-RestMethod -Method Post -Headers $headers -Uri "https://graph.microsoft.com/v1.0/drives/$($drive.id)/items/$($workbook.id)/workbook/createSession" -Body (@{ persistChanges = $true } | ConvertTo-Json)
$sessionHeaders = $headers.Clone()
$sessionHeaders['workbook-session-id'] = $session.id

$definitions = @(
    @{ sheet = 'Facturas'; table = 'tblFacturas'; columns = @('FacturaId','EstadoProceso','EstadoPago','ProveedorNombre','NumeroFactura','FechaFactura','FechaVencimiento','BaseImponible','ImporteIVA','TotalFactura','Moneda','EnlacePDF','MessageId','RemitenteCorreo','FechaRecepcion','NombreArchivoOriginal','NombreArchivoFinal','SharePointItemId','ClaveDuplicado','ConfianzaExtraccion','MotivoRevision','FechaProcesado','FechaPago','MovimientoBancoId') },
    @{ sheet = 'LotesBancarios'; table = 'tblLotesBancarios'; columns = @('LoteImportacionId','NombreArchivo','HashArchivo','VersionEsquema','FechaImportacion','UsuarioImportacion','EstadoLote','FilasTotales','FilasValidas','FilasRechazadas','MotivoError') },
    @{ sheet = 'Movimientos'; table = 'tblMovimientos'; columns = @('MovimientoBancoId','LoteImportacionId','IdentificadorOrigen','FechaMovimiento','FechaValor','ConceptoOriginal','ConceptoNormalizado','Importe','Moneda','Referencia','Contraparte','Huella','FacturaId','ResultadoConciliacion','PuntuacionConciliacion','MotivosPuntuacion') },
    @{ sheet = 'Conciliaciones'; table = 'tblConciliaciones'; columns = @('ConciliacionId','FacturaId','MovimientoBancoId','Resultado','Puntuacion','Motivos','EstadoDecision','ModoAceptacion','DecididoPor','FechaDecision','ImporteAplicado') }
)

try {
    $worksheets = (Invoke-RestMethod -Headers $sessionHeaders -Uri "https://graph.microsoft.com/v1.0/drives/$($drive.id)/items/$($workbook.id)/workbook/worksheets").value
    $tables = (Invoke-RestMethod -Headers $sessionHeaders -Uri "https://graph.microsoft.com/v1.0/drives/$($drive.id)/items/$($workbook.id)/workbook/tables").value
    $createdSheets = @()
    $createdTables = @()

    foreach ($definition in $definitions) {
        $worksheet = $worksheets | Where-Object { $_.name -eq $definition.sheet } | Select-Object -First 1
        if (-not $worksheet) {
            if ($definition.sheet -eq 'Facturas' -and $worksheets.Count -eq 1 -and $tables.Count -eq 0) {
                $worksheet = $worksheets[0]
                Invoke-RestMethod -Method Patch -Headers $sessionHeaders `
                    -Uri "https://graph.microsoft.com/v1.0/drives/$($drive.id)/items/$($workbook.id)/workbook/worksheets/$($worksheet.id)" `
                    -Body (@{ name = $definition.sheet } | ConvertTo-Json) | Out-Null
            }
            else {
                $worksheet = Invoke-RestMethod -Method Post -Headers $sessionHeaders `
                    -Uri "https://graph.microsoft.com/v1.0/drives/$($drive.id)/items/$($workbook.id)/workbook/worksheets/add" `
                    -Body (@{ name = $definition.sheet } | ConvertTo-Json)
            }
            $createdSheets += $definition.sheet
            $worksheets = (Invoke-RestMethod -Headers $sessionHeaders -Uri "https://graph.microsoft.com/v1.0/drives/$($drive.id)/items/$($workbook.id)/workbook/worksheets").value
            $worksheet = $worksheets | Where-Object { $_.name -eq $definition.sheet } | Select-Object -First 1
        }

        if (-not ($tables | Where-Object { $_.name -eq $definition.table })) {
            $lastColumn = Get-ColumnLetter -Number $definition.columns.Count
            $headerRows = New-Object 'object[]' 1
            $headerRows[0] = [object[]]$definition.columns
            $rangeBody = @{ values = $headerRows } | ConvertTo-Json -Depth 4
            Invoke-RestMethod -Method Patch -Headers $sessionHeaders `
                -Uri "https://graph.microsoft.com/v1.0/drives/$($drive.id)/items/$($workbook.id)/workbook/worksheets/$($worksheet.id)/range(address='A1:$($lastColumn)1')" `
                -Body $rangeBody | Out-Null
            $tableBody = @{ address = "$($definition.sheet)!A1:$($lastColumn)1"; hasHeaders = $true; name = $definition.table } | ConvertTo-Json
            Invoke-RestMethod -Method Post -Headers $sessionHeaders `
                -Uri "https://graph.microsoft.com/v1.0/drives/$($drive.id)/items/$($workbook.id)/workbook/tables/add" `
                -Body $tableBody | Out-Null
            $createdTables += $definition.table
            $tables = (Invoke-RestMethod -Headers $sessionHeaders -Uri "https://graph.microsoft.com/v1.0/drives/$($drive.id)/items/$($workbook.id)/workbook/tables").value
        }
    }

    [pscustomobject]@{
        workbookUrl = $workbook.webUrl
        createdSheets = $createdSheets
        createdTables = $createdTables
    } | ConvertTo-Json -Depth 4
}
finally {
    Invoke-RestMethod -Method Post -Headers $sessionHeaders -Uri "https://graph.microsoft.com/v1.0/drives/$($drive.id)/items/$($workbook.id)/workbook/closeSession" -Body '{}' -ErrorAction SilentlyContinue | Out-Null
}

# The access token exists only in this process and is discarded on exit.
