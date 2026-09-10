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

`/api/invoices/extract` usa el modelo `prebuilt-invoice` de Document Intelligence y limita el análisis a las páginas 1-2 para respetar el nivel gratuito F0. El cuerpo es el PDF binario; opcionalmente admite `x-filename`, `x-message-id`, `x-attachment-id` y `x-sender`. Devuelve `invoice`, `confidence` y `validation`. La autenticación Entra de la Function protege también este endpoint.

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
  }
}
```

## Importar filas bancarias

Power Automate conserva el fichero original en SharePoint, calcula o proporciona su hash, lee las filas de la tabla Excel y envía JSON. El mapeo no está fijado en código, por lo que cada banco puede disponer de una versión de esquema.

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

La petición contiene movimientos normalizados y facturas pendientes. La respuesta devuelve candidatos ordenados, puntuación, factores explicativos, clasificación y necesidad de revisión humana. La API nunca persiste ni acepta una coincidencia por sí sola; Power Automate o la capa de persistencia aplica la decisión de acuerdo con la política aprobada.

Los valores provisionales están en `deployment/reconciliation-config.json`. La aceptación automática está deshabilitada hasta calibrar el piloto.

## Desarrollo local

```powershell
Copy-Item local.settings.example.json local.settings.json
npm ci
npm run check
npm start
```

`npm start` requiere Azure Functions Core Tools v4 instalado en el equipo. El servicio compilado tiene su entrada en `dist/src/functions/app.js`.
