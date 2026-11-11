param(
    [string]$ImagePath = 'docs\assets\automatizacion-facturas-flujo.png',
    [string]$LogoPath = 'docs\assets\logo_EMAS.jpg',
    [string]$OutputPath = 'docs\Automatizacion_facturas_flujo_y_coste.pdf'
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

function Escape-Pdf([string]$Value) {
    return $Value.Replace('\', '\\').Replace('(', '\(').Replace(')', '\)')
}

function Pdf-Text([string]$Text, [double]$X, [double]$Y, [double]$Size, [string]$Font = 'F1', [string]$Color = '0.05 0.12 0.25') {
    $safe = Escape-Pdf $Text
    return "BT /$Font $Size Tf $Color rg 1 0 0 1 $X $Y Tm ($safe) Tj ET`n"
}

function Pdf-Box([double]$X, [double]$Y, [double]$W, [double]$H, [string]$Fill = '0.93 0.97 1') {
    return "$Fill rg $X $Y $W $H re f`n0.14 0.46 0.86 RG 0.8 w $X $Y $W $H re S`n"
}

function Pdf-Arrow([double]$X1, [double]$Y1, [double]$X2, [double]$Y2) {
    return "0.10 0.48 0.90 RG 1.5 w $X1 $Y1 m $X2 $Y2 l S`n0.10 0.48 0.90 rg $X2 $Y2 m $($X2 - 7) $($Y2 + 4) l $($X2 - 7) $($Y2 - 4) l h f`n"
}

function Pdf-ElbowArrow([double]$X1, [double]$Y1, [double]$X2, [double]$Y2, [double]$MidY) {
    return "0.10 0.48 0.90 RG 1.5 w $X1 $Y1 m $X1 $MidY l $X2 $MidY l $X2 $Y2 l S`n0.10 0.48 0.90 rg $X2 $Y2 m $($X2 - 4) $($Y2 + 7) l $($X2 + 4) $($Y2 + 7) l h f`n"
}

if (-not (Test-Path -LiteralPath $ImagePath)) { throw "No se encuentra la ilustracion: $ImagePath" }
if (-not (Test-Path -LiteralPath $LogoPath)) { throw "No se encuentra el logotipo: $LogoPath" }

$outputFullPath = Join-Path (Get-Location) $OutputPath
$outputDirectory = Split-Path -Parent $outputFullPath
New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null

function Get-JpegAsset([string]$Path) {
    $image = [System.Drawing.Image]::FromFile($Path)
    $stream = New-Object System.IO.MemoryStream
    $image.Save($stream, [System.Drawing.Imaging.ImageFormat]::Jpeg)
    $asset = @{ Bytes = $stream.ToArray(); Width = $image.Width; Height = $image.Height }
    $image.Dispose()
    $stream.Dispose()
    return $asset
}

$flowAsset = Get-JpegAsset $ImagePath
$logoAsset = Get-JpegAsset $LogoPath

$winAnsi = [System.Text.Encoding]::GetEncoding(1252)
$objects = New-Object System.Collections.Generic.List[byte[]]
function Add-PdfObject([byte[]]$Body) { $objects.Add($Body); return $objects.Count }
function Add-PdfTextObject([string]$Body) { return Add-PdfObject ($winAnsi.GetBytes($Body)) }
function Add-PdfStream([string]$Content) {
    $bytes = $winAnsi.GetBytes($Content)
    $head = $winAnsi.GetBytes("<< /Length $($bytes.Length) >>`nstream`n")
    $tail = $winAnsi.GetBytes("`nendstream")
    $combined = New-Object byte[] ($head.Length + $bytes.Length + $tail.Length)
    [Array]::Copy($head, 0, $combined, 0, $head.Length)
    [Array]::Copy($bytes, 0, $combined, $head.Length, $bytes.Length)
    [Array]::Copy($tail, 0, $combined, $head.Length + $bytes.Length, $tail.Length)
    return Add-PdfObject $combined
}

# Reserve core objects: catalog, pages, fonts, image, pages and their contents.
$catalog = Add-PdfTextObject ''
$pages = Add-PdfTextObject ''
$fontRegular = Add-PdfTextObject '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'
$fontBold = Add-PdfTextObject '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'
function Add-PdfImage([hashtable]$Asset) {
    $imageHeader = $winAnsi.GetBytes("<< /Type /XObject /Subtype /Image /Width $($Asset.Width) /Height $($Asset.Height) /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length $($Asset.Bytes.Length) >>`nstream`n")
    $imageFooter = $winAnsi.GetBytes("`nendstream")
    $imageBody = New-Object byte[] ($imageHeader.Length + $Asset.Bytes.Length + $imageFooter.Length)
    [Array]::Copy($imageHeader, 0, $imageBody, 0, $imageHeader.Length)
    [Array]::Copy($Asset.Bytes, 0, $imageBody, $imageHeader.Length, $Asset.Bytes.Length)
    [Array]::Copy($imageFooter, 0, $imageBody, $imageHeader.Length + $Asset.Bytes.Length, $imageFooter.Length)
    return Add-PdfObject $imageBody
}
$imageObject = Add-PdfImage $flowAsset
$logoObject = Add-PdfImage $logoAsset

$page1 = Add-PdfTextObject ''
$page2 = Add-PdfTextObject ''
$page3 = Add-PdfTextObject ''

$page1Content = ''
$page1Content += "0.97 0.99 1 rg 0 0 595 842 re f`n"
$page1Content += Pdf-Text 'Automatización de facturas' 42 782 25 'F2' '0.04 0.20 0.45'
$page1Content += Pdf-Text 'Microsoft 365 + Azure | Flujo, recursos y coste aproximado' 42 754 12 'F1' '0.20 0.31 0.45'
$page1Content += "q 124 0 0 49 425 742 cm /Im2 Do Q`n"
$page1Content += "q 510 0 0 287 42 420 cm /Im1 Do Q`n"
$page1Content += Pdf-Text 'Del correo a una fuente fiable para pagos, sin Power Automate.' 42 388 14 'F2' '0.04 0.20 0.45'
$page1Content += Pdf-Box 42 294 154 67
$page1Content += Pdf-Box 220 294 154 67
$page1Content += Pdf-Box 398 294 154 67
$page1Content += Pdf-Text '1. Recepción' 58 338 12 'F2'
$page1Content += Pdf-Text 'Correo con PDF llega' 58 320 9 'F1'
$page1Content += Pdf-Text 'al buzón vigilado.' 58 307 9 'F1'
$page1Content += Pdf-Text '2. Proceso seguro' 236 338 12 'F2'
$page1Content += Pdf-Text 'La Function clasifica,' 236 320 9 'F1'
$page1Content += Pdf-Text 'extrae y valida.' 236 307 9 'F1'
$page1Content += Pdf-Text '3. Consulta operativa' 414 338 12 'F2'
$page1Content += Pdf-Text 'SharePoint conserva y' 414 320 9 'F1'
$page1Content += Pdf-Text 'Copilot responde.' 414 307 9 'F1'
$page1Content += Pdf-Arrow 197 327 217 327
$page1Content += Pdf-Arrow 375 327 395 327
$page1Content += Pdf-Text 'Resultado: trazabilidad por adjunto, archivo PDF, registro fiscal y consulta de pagos.' 42 240 12 'F1' '0.05 0.12 0.25'
$page1Content += Pdf-Text 'El correo no se mueve ni se marca: la integración lo lee con permisos limitados.' 42 214 10 'F1' '0.20 0.31 0.45'
$page1Content += Pdf-Text 'Entorno de referencia: Outlook / Exchange Online, Azure Functions, Microsoft Graph,' 42 150 10 'F1' '0.20 0.31 0.45'
$page1Content += Pdf-Text 'Azure AI Document Intelligence, SharePoint Lists y el agente Asistente de pagos.' 42 132 10 'F1' '0.20 0.31 0.45'
$page1Content += Pdf-Text 'Documento de explicación operativa | septiembre de 2026' 42 52 9 'F1' '0.35 0.43 0.55'

$page2Content = ''
$page2Content += "0.99 1 1 rg 0 0 595 842 re f`n"
$page2Content += Pdf-Text 'Recursos y recorrido técnico' 42 782 23 'F2' '0.04 0.20 0.45'
$page2Content += Pdf-Text 'Una arquitectura serverless conectada por Microsoft Graph; no usa Power Automate.' 42 755 11 'F1' '0.20 0.31 0.45'
$boxes = @(
    @{x=42;y=635;w=155;h=78;t='Outlook / Exchange';a='Buzón de facturas';b='PDF entrante'},
    @{x=220;y=635;w=155;h=78;t='Azure Functions';a='Sondeo cada 10 min';b='Orquestación'},
    @{x=398;y=635;w=155;h=78;t='Microsoft Graph';a='Acceso delegado por';b='identidad administrada'},
    @{x=42;y=470;w=155;h=92;t='Document Intelligence';a='Clasifica y extrae';b='proveedor, factura,';c='fechas e importes'},
    @{x=220;y=470;w=155;h=92;t='Reglas de negocio';a='Proveedor, NIF, IVA,';b='duplicados e';c='idempotencia'},
    @{x=398;y=470;w=155;h=92;t='SharePoint';a='PDF archivado +';b='ProcesosFacturas,';c='Registro y Excepciones'},
    @{x=42;y=282;w=240;h=104;t='Previsiones y conciliación';a='Excel de Tesorería -> PrevisionesPagos';b='Una factura solo queda Pagada';c='tras conciliación humana'},
    @{x=314;y=282;w=239;h=104;t='ConsultaPagosCopilot';a='Lista derivada, actualizada';b='periódicamente, para el agente';c='Asistente de pagos'}
)
foreach ($box in $boxes) {
    $page2Content += Pdf-Box $box.x $box.y $box.w $box.h
    $page2Content += Pdf-Text $box.t ($box.x + 12) ($box.y + $box.h - 22) 11 'F2'
    $page2Content += Pdf-Text $box.a ($box.x + 12) ($box.y + $box.h - 41) 9 'F1'
    $page2Content += Pdf-Text $box.b ($box.x + 12) ($box.y + $box.h - 55) 9 'F1'
    if ($box.c) { $page2Content += Pdf-Text $box.c ($box.x + 12) ($box.y + $box.h - 69) 9 'F1' }
}
$page2Content += Pdf-Arrow 198 674 217 674
$page2Content += Pdf-Arrow 376 674 395 674
$page2Content += Pdf-ElbowArrow 298 634 120 565 598
$page2Content += Pdf-Arrow 197 516 217 516
$page2Content += Pdf-Arrow 376 516 395 516
$page2Content += Pdf-ElbowArrow 298 469 162 386 425
$page2Content += Pdf-ElbowArrow 476 469 433 386 425
$page2Content += Pdf-Text 'Seguridad y control' 42 210 14 'F2' '0.04 0.20 0.45'
$page2Content += Pdf-Text '- Identidad administrada: no hay secretos de Graph en el código ni en el correo.' 48 185 10 'F1'
$page2Content += Pdf-Text '- Permisos limitados: Graph y SharePoint solo acceden al buzón y sitio autorizados.' 48 164 10 'F1'
$page2Content += Pdf-Text '- Auditoría: cada adjunto conserva ProcessId, estado, evidencia y excepciones.' 48 143 10 'F1'
$page2Content += Pdf-Text '- Idempotencia: un nuevo sondeo no duplica PDFs, registros ni previsiones.' 48 122 10 'F1'
$page2Content += Pdf-Text 'Fuente de pagos: ConsultaPagosCopilot; no se consulta el Excel directamente.' 42 69 10 'F1' '0.20 0.31 0.45'

$page3Content = ''
$page3Content += "0.97 0.99 1 rg 0 0 595 842 re f`n"
$page3Content += Pdf-Text 'Coste aproximado por factura' 42 782 23 'F2' '0.04 0.20 0.45'
$page3Content += Pdf-Text 'Estimación orientativa para el circuito actual; no constituye una oferta comercial.' 42 755 11 'F1' '0.20 0.31 0.45'
$page3Content += Pdf-Box 42 655 511 65 '0.89 0.96 1'
$page3Content += Pdf-Text '0,01 a 0,03 EUR por factura PDF de 1 a 2 páginas' 63 688 19 'F2' '0.02 0.32 0.66'
$page3Content += Pdf-Text 'Después de la cuota gratuita; el principal coste variable es Document Intelligence.' 63 669 10 'F1' '0.20 0.31 0.45'
$page3Content += Pdf-Text 'Componente' 52 610 11 'F2' '0.04 0.20 0.45'
$page3Content += Pdf-Text 'Cómo se aplica al flujo' 205 610 11 'F2' '0.04 0.20 0.45'
$page3Content += Pdf-Text 'Impacto estimado' 414 610 11 'F2' '0.04 0.20 0.45'
$rows = @(
    @('Document Intelligence','Lectura previa + modelo Invoice','Principal coste','variable'),
    @('Azure Functions Flex','Sondeo y proceso serverless','Normalmente dentro','de cuota'),
    @('Microsoft Graph / SharePoint','Correo, archivo y listas','Incluido en M365','según licencia'),
    @('Copilot / agente','Consultas sobre lista derivada','Licencia fija;','no por factura'),
    @('Storage / App Insights','PDFs, telemetría y retención','Coste compartido','y bajo')
)
$y = 577
foreach ($row in $rows) {
$page3Content += "0.85 0.90 0.96 RG 0.5 w 42 $($y - 16) 511 42 re S`n"
    $page3Content += Pdf-Text $row[0] 52 $y 10 'F2'
    $page3Content += Pdf-Text $row[1] 205 $y 9 'F1'
    $page3Content += Pdf-Text $row[2] 414 $y 8.5 'F1'
    $page3Content += Pdf-Text $row[3] 414 $($y - 13) 8.5 'F1'
    $y -= 48
}
$page3Content += Pdf-Text 'Cómo se calcula' 42 322 14 'F2' '0.04 0.20 0.45'
$page3Content += Pdf-Text '1. El nivel F0 de Document Intelligence incluye 500 páginas gratuitas al mes.' 48 296 10 'F1'
$page3Content += Pdf-Text '2. Una factura de una página suele pasar por lectura previa y extracción: unas 2 páginas analizadas.' 48 274 10 'F1'
$page3Content += Pdf-Text '3. Por ello, el piloto puede cubrir aproximadamente 250 facturas de una página sin coste de IA.' 48 252 10 'F1'
$page3Content += Pdf-Text '4. Tras esa cuota, el coste real depende de páginas, región Azure, contrato y modelo utilizado.' 48 230 10 'F1'
$page3Content += Pdf-Text 'Notas importantes' 42 182 14 'F2' '0.04 0.20 0.45'
$page3Content += Pdf-Text '- No hay coste de Power Automate porque no forma parte de la solución.' 48 156 10 'F1'
$page3Content += Pdf-Text '- Las licencias Microsoft 365 y Copilot son costes fijos del tenant, no un coste unitario por factura.' 48 135 10 'F1'
$page3Content += Pdf-Text '- La estimación debe confirmarse en Azure Pricing Calculator con la suscripción y región definitivas.' 48 114 10 'F1'
$page3Content += Pdf-Text 'Fuentes: azure.microsoft.com/pricing/details/document-intelligence/ | azure.microsoft.com/pricing/details/functions/' 42 63 8 'F1' '0.35 0.43 0.55'

$content1 = Add-PdfStream $page1Content
$content2 = Add-PdfStream $page2Content
$content3 = Add-PdfStream $page3Content
$objects[$catalog - 1] = $winAnsi.GetBytes("<< /Type /Catalog /Pages $pages 0 R >>")
$objects[$pages - 1] = $winAnsi.GetBytes("<< /Type /Pages /Kids [$page1 0 R $page2 0 R $page3 0 R] /Count 3 >>")
$resources = "/Resources << /Font << /F1 $fontRegular 0 R /F2 $fontBold 0 R >> /XObject << /Im1 $imageObject 0 R /Im2 $logoObject 0 R >> >>"
$objects[$page1 - 1] = $winAnsi.GetBytes("<< /Type /Page /Parent $pages 0 R /MediaBox [0 0 595 842] $resources /Contents $content1 0 R >>")
$objects[$page2 - 1] = $winAnsi.GetBytes("<< /Type /Page /Parent $pages 0 R /MediaBox [0 0 595 842] $resources /Contents $content2 0 R >>")
$objects[$page3 - 1] = $winAnsi.GetBytes("<< /Type /Page /Parent $pages 0 R /MediaBox [0 0 595 842] $resources /Contents $content3 0 R >>")

$file = New-Object System.IO.MemoryStream
$writer = New-Object System.IO.BinaryWriter($file)
$writer.Write($winAnsi.GetBytes("%PDF-1.4`n%"))
$writer.Write([byte[]](0xE2, 0xE3, 0xCF, 0xD3, 0x0A))
$offsets = New-Object System.Collections.Generic.List[int64]
$offsets.Add(0)
for ($i = 0; $i -lt $objects.Count; $i++) {
    $offsets.Add($file.Position)
    $writer.Write($winAnsi.GetBytes("$($i + 1) 0 obj`n"))
    $writer.Write($objects[$i])
    $writer.Write($winAnsi.GetBytes("`nendobj`n"))
}
$xref = $file.Position
$writer.Write($winAnsi.GetBytes("xref`n0 $($objects.Count + 1)`n0000000000 65535 f `n"))
for ($i = 1; $i -lt $offsets.Count; $i++) { $writer.Write($winAnsi.GetBytes(('{0:0000000000} 00000 n ' -f $offsets[$i]) + "`n")) }
$writer.Write($winAnsi.GetBytes("trailer`n<< /Size $($objects.Count + 1) /Root $catalog 0 R >>`nstartxref`n$xref`n%%EOF`n"))
$writer.Flush()
[System.IO.File]::WriteAllBytes($outputFullPath, $file.ToArray())
$writer.Dispose()
$file.Dispose()

Write-Output "PDF creado: $outputFullPath"
