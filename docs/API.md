# API de Azure Functions
La API usa Azure Functions Runtime 4, modelo de programación Node.js v4 y Node.js 24. En Azure, Microsoft Entra protege todas las rutas mediante App Service Authentication. `authLevel` permanece `anonymous` intencionadamente porque la autenticación se aplica antes de que la petición llegue a la Function; no se emplean claves compartidas.

## Rutas

| Método | Ruta | Finalidad |
|---|---|---|
| GET | `/api/health` | Estado y versión del servicio |
| POST | `/api/invoices/validate` | Validar una extracción de factura |
| POST | `/api/invoices/extract` | Extraer y validar un PDF durante el piloto (cuerpo `application/pdf`) |
| POST | `/api/bank/import` | Validar y normalizar filas de un extracto |
| POST | `/api/bank/reconcile` | Puntuar movimientos contra facturas pendientes |
| POST | `/api/exceptions/assign` | Asignar una excepción abierta a un responsable |
| POST | `/api/exceptions/resolve` | Cerrar una excepción con una acción permitida y resultado auditado |

`/api/invoices/extract` realiza primero una lectura de las páginas 1-2 con `prebuilt-read` y clasifica el texto mediante reglas deterministas y auditables. Las categorías son `invoice`, `bank_settlement` y `other`. Solo `invoice` continúa hacia `prebuilt-invoice`; las otras categorías devuelven `classification` y `extractionSkipped: true`, sin intentar extraer ni archivar una factura. El cuerpo es el PDF binario; opcionalmente admite `x-filename`, `x-message-id`, `x-attachment-id` y `x-sender`. La autenticación Entra de la Function protege también este endpoint.

La evidencia de factura combina encabezado `Factura`/`Invoice` con señales fiscales como base imponible, IVA, fecha o total de factura. Una señal fuerte de liquidación —por ejemplo `Liquidación de recibos`— junto con nominal abonado, fecha valor, intereses, comisiones o gastos se clasifica como `bank_settlement`. Evidencia débil o contradictoria produce `other`; el sistema prefiere revisión a un falso positivo. Para una factura válida, la respuesta incorpora `classification`, `invoice`, `confidence`, `supplierIdentity` y `validation`.

El mapeo prefiere `VendorAddressRecipient` frente al nombre comercial abreviado. Si el modelo omite `SubTotal` pero entrega un `InvoiceTotal` estrictamente mayor que `TotalTax`, deriva la base mediante resta y conserva como confianza la menor de ambas fuentes; una confianza insuficiente sigue obligando a revisión humana. Si total e impuesto son iguales, no deriva una base cero porque suele indicar una detección errónea del total.

La validación conserva `0,8` como umbral general de respaldo y aplica esta política piloto por campo: proveedor `0,75`, NIF `0,80`, número `0,70`, fecha de factura `0,85`, vencimiento `0,65`, base imponible `0,40`, IVA `0,80`, total `0,90` y moneda `0,80`. Un umbral de confianza superado no reemplaza las reglas deterministas: los campos obligatorios deben existir, fechas e importes deben tener formato válido y base más IVA debe coincidir con el total dentro de un céntimo. Por ello, una base con confianza reducida solo se acepta cuando el conjunto fiscal es completo y coherente.

El endpoint consulta `MaestroProveedores` y devuelve `supplierIdentity`. Un NIF extraído solo valida mediante coincidencia exacta y única con un proveedor activo; si no hay NIF, se permite coincidencia exacta tras normalizar razón social o un alias explícito. Los estados `not_found` y `ambiguous` hacen que `validation.valid` sea `false`.

## Validar factura

```json
{
  "invoice": {
    "supplierName": "ACME SL",
    "invoiceNumber": "F-2026-15",
    "invoiceDate": "2026-08-20",
    "dueDate": "2026-09-05",
    "taxableBase": "1000.00",
    "vatAmount": "210.00",
    "totalAmount": "1210.00",
    "currency": "EUR"
  },
  "confidence": {
    "supplierName": 0.91,
    "invoiceNumber": 0.88,
    "invoiceDate": 0.94,
    "taxableBase": 0.86,
    "vatAmount": 0.93,
    "totalAmount": 0.96,
    "currency": 0.96
  }
}
```

## Importar filas bancarias

El temporizador de Azure Functions conserva el fichero original en SharePoint, calcula su hash, lee la primera hoja y registra el lote y los movimientos en Lists. Este endpoint se mantiene para clientes autorizados que necesiten validar filas antes de importarlas. El mapeo no está fijado en código, por lo que cada banco puede disponer de una versión de esquema.

```json
{
  "sourceFilename": "extracto-2026-09.xlsx",
  "sourceHash": "sha256-del-archivo",
  "config": {
    "schemaVersion": "1.0",
    "debitSign": "negative",
    "defaultCurrency": "EUR",
    "columns": {
      "id": "IdMovimiento",
      "bookingDate": "FechaMovimiento",
      "valueDate": "FechaValor",
      "description": "Concepto",
      "amount": "Importe",
      "currency": "Moneda",
      "reference": "Referencia",
      "counterparty": "Contraparte"
    }
  },
  "rows": []
}
```

Los errores de datos devuelven `accepted: false` con todas las incidencias detectadas. Los duplicados no bloquean el resto del lote y quedan informados.

## Conciliar

La petición contiene movimientos normalizados y facturas pendientes. La respuesta devuelve candidatos ordenados, puntuación, factores explicativos, clasificación y necesidad de revisión humana. La API nunca persiste ni acepta una coincidencia por sí sola; la capa operativa autorizada aplica la decisión de acuerdo con la política aprobada.

Los valores provisionales están en `deployment/reconciliation-config.json`. La aceptación automática está deshabilitada hasta calibrar el piloto.

## Revisar excepciones

`POST /api/exceptions/assign` recibe `exceptionId` y `responsible`; solo admite excepciones en estado `Abierta` o `EnRevision` y las deja en `EnRevision`.

`POST /api/exceptions/resolve` recibe `exceptionId`, `code`, `responsible`, `action` y `result`. El servicio vuelve a leer el código persistido en SharePoint antes de cerrar, por lo que nunca confía en el código enviado por el cliente. Registra `Responsable`, `AccionResolucion`, `ResultadoResolucion` y `FechaResolucion` UTC. Solo permite estas acciones:

| Código | Acción |
|---|---|
| `EX-02`, `EX-05` | `request_replacement` |
| `EX-03` | `discard_non_invoice` → `Descartada` |
| `EX-04` | `retry_after_correction` |
| `EX-06` | `update_supplier_and_resubmit` |
| `EX-07` | `confirm_duplicate` → `Descartada` |
| `EX-08`, `EX-09` | `retry_after_technical_fix` |

Las acciones de reenvío, corrección o reintento no crean registros ni PDF automáticamente: requieren un nuevo envío o reproceso controlado, preservando la idempotencia fiscal.

Al cerrar una excepción de factura, el servicio localiza su `CorrelationId` en `ProcesosFacturas` y sincroniza el estado del proceso: `Descartada` pasa a `discarded` y `Resuelta` a `resolved`. Así el elemento sale de la vista `Pendientes de revisión` sin falsear un proceso como `completed`.

## Desarrollo local

```powershell
Copy-Item local.settings.example.json local.settings.json
npm ci
npm run check
npm start
```

`npm start` requiere Azure Functions Core Tools v4 instalado en el equipo. El servicio compilado tiene su entrada en `dist/src/functions/app.js`.
