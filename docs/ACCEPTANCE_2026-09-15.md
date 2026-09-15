# Evidencia de aceptación — archivado de facturas por proveedor

Fecha: 15 de septiembre de 2026  
Entorno: `dev` / `func-facturas-copilot-dev-jbhyjbgfzr3iy` / Spain Central

## Objetivo

Validar una nomenclatura comprensible para negocio y el archivo automático por proveedor, manteniendo la seguridad, la trazabilidad y la idempotencia del circuito de facturas recibido por e-mail.

## Decisiones aprobadas

- El PDF visible se archiva con el patrón:

  ```text
  Facturas/<PROVEEDOR>/<NUMERO_FACTURA>_<AAAA-DDMM>_<IMPORTE>_<MONEDA>.pdf
  ```

- La fecha corresponde a la fecha de factura.
- El importe usa dos decimales y punto decimal; la moneda se conserva en el nombre.
- Los caracteres incompatibles con nombres de archivo se normalizan; por ejemplo, `/` se transforma en `-`.
- Si existe una colisión real de ruta, se añade un sufijo derivado del `ProcessId` para no sobrescribir el documento existente.
- El e-mail de origen permanece sin modificar: el buzón se consulta en modo lectura. Solo se renombra y organiza la copia archivada en SharePoint.

Ejemplos esperados:

```text
Facturas/SATINFO SL/SF 198033_2026-2307_200.86_EUR.pdf
Facturas/Endesa Energía, S.A. Unipersonal/1788963399671_2026-0509_387.21_EUR.pdf
Facturas/EMAS PRINTING SOLUTIONS/F26-1334_2026-2402_55.00_EUR.pdf
```

## Preparación de la prueba

1. Se revisaron los documentos de prueba y se excluyó el PDF de Bankinter del circuito de facturas: es un justificante/liquidación bancaria, no una factura fiscal.
2. Se prepararon los tres PDF a utilizar:

   - `FASF198033-satinfo.pdf`
   - `FA-endesa-1788963399671.pdf`
   - `F26_1334-emas.pdf`

3. Se limpiaron los artefactos de pruebas anteriores en SharePoint: archivos archivados, registros fiscales, procesos e incidencias asociadas.
4. Se revisó `MaestroProveedores` y se dejaron activos los proveedores necesarios:

   | Código | Razón social | NIF |
   |---|---|---|
   | `SATINFO` | `SATINFO SL` | `B60310356` |
   | `ENDESA` | `Endesa Energía, S.A. Unipersonal` | `A81948077` |
   | `EMAS` | `Emas Printing Solutions, SL` | `B63644462` |

   El NIF inicialmente configurado para EMAS correspondía al receptor de `F26/1334`; se corrigió al NIF del emisor.

5. Se movieron los mensajes de prueba anteriores fuera de `facturas-pruebas@integramente.onmicrosoft.com/Inbox` para evitar que el sondeo los volviera a procesar.

## Cambio implementado y despliegue

El commit `b431331` (`Organize archived invoices by supplier`) se publicó en `main` y se desplegó mediante el workflow **Deploy Azure Function** de GitHub Actions.

El cambio:

- construye el nombre de negocio desde número, fecha, importe y moneda;
- construye la ruta relativa incluyendo la carpeta del proveedor;
- crea esa carpeta en SharePoint si no existe;
- conserva la idempotencia y evita sobrescrituras con un sufijo hash solo en caso de colisión;
- persiste el nombre final efectivo en `ProcesosFacturas`.

La configuración aplicada en la Function para esta prueba fue:

```text
INVOICE_PROCESSING_ENABLED=true
INVOICE_PROCESSING_NOT_BEFORE=2026-09-15T18:05:00Z
```

El corte excluye los correos anteriores y permite procesar solamente los mensajes enviados después de ese instante UTC.

## Resultado de la primera prueba limpia

Se envió un único correo al buzón `facturas-pruebas@integramente.onmicrosoft.com` con el único adjunto `FASF198033-satinfo.pdf`.

Resultado observado tras el ciclo de `pollInvoiceMailbox`:

| Comprobación | Resultado |
|---|---|
| Estado de proceso | `completed` |
| Archivo original | `FASF198033-satinfo.pdf` |
| Ruta registrada | `SATINFO SL/SF 198033_2026-2307_200.86_EUR.pdf` |
| Archivo en SharePoint | `Facturas/SATINFO SL/SF 198033_2026-2307_200.86_EUR.pdf` |
| Fecha de archivo | `2026-09-15T18:10:40Z` |
| Proveedor extraído | `SATINFO SL` |
| NIF | `B60310356` |
| Número de factura | `SF 198033` |
| Fecha de factura | 23/07/2026 |
| Vencimiento | 23/08/2026 |
| Base imponible | 166,00 EUR |
| IVA | 34,86 EUR |
| Total | 200,86 EUR |
| Excepciones | Ninguna |

El archivo se creó con `SharePoint App` como autor y tamaño de 131.584 bytes. El patrón acordado se validó de extremo a extremo.

## Observaciones para las siguientes pruebas

- La factura `F26/1334` es emitida por EMAS a un cliente. Es útil para probar cobros y conciliación, pero el circuito actual está orientado a facturas recibidas y la tratará como documento cuyo emisor es EMAS.
- Las pruebas de Endesa y EMAS deben enviarse de una en una, comprobando `ProcesosFacturas`, `RegistroFacturas` y la carpeta del proveedor antes de continuar.
- Los extractos bancarios simulados se conservan como insumo de la siguiente fase de conciliación; no se utilizaron en esta prueba de recepción y archivado.
