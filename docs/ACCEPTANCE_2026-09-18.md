# Evidencia de aceptación — conciliaciones en SharePoint

Fecha: 18 de septiembre de 2026
Entorno: `dev` / `func-facturas-copilot-dev-jbhyjbgfzr3iy`

## Objetivo

Validar contra Microsoft Graph, SharePoint Lists y la Azure Function desplegada los criterios de aceptación de conciliación CA-17, CA-18 y CA-19.

## Preparación

- Se comprobó la configuración no secreta de la Function: tiene `M365_SHAREPOINT_SITE_ID`; `M365_BANK_MOVEMENTS_LIST` apunta a `MovimientosBancarios`; y la lista de conciliaciones usa el valor predeterminado `Conciliaciones`.
- Se comprobó la existencia de las listas `MovimientosBancarios` y `Conciliaciones` y la lectura de sus elementos mediante Microsoft Graph.
- Se verificó el contrato protegido de `POST /api/bank/reconciliations/propose`: una petición inválida devuelve HTTP 400 sin crear datos.
- Se usaron exclusivamente movimientos sintéticos identificados como `CA17-*`, `CA18-*` y `CA19-*`; no se procesaron facturas ni pagos reales.

## Resultado

| Criterio | Conciliación | Resultado observado | Estado del movimiento |
|---|---:|---|---|
| CA-17 Ambigüedad a revisión | 12 | `PendienteRevision` | `EnRevision` |
| CA-18 Confirmación auditada | 13 | `Conciliada`; decisión `confirm_match` y responsable registrado | `Conciliado` |
| CA-19 Rechazo auditado | 14 | `Rechazada`; decisión `reject_match` y responsable registrado | `EnRevision` |

Las tres comprobaciones pasaron en la primera ejecución a las `2026-09-18T13:47:00Z`. La API se autenticó con Microsoft Entra y las lecturas de verificación se realizaron directamente contra SharePoint mediante Microsoft Graph.

## Circuito de facturas simuladas y consultas de pago

### Objetivo

Validar el recorrido de PDFs digitales enviados al buzón de pruebas hasta SharePoint y preparar una fuente única de pagos para futuras consultas mediante Copilot.

### Preparación

- Se aprovisionó la lista derivada `ConsultaPagosCopilot`, alimentada por facturas, previsiones, conciliaciones y movimientos. Su modelo usa unidades menores para todos los importes y no marca una factura como `Pagada` sin una conciliación humana confirmada.
- Se añadió `RegistroFacturas.ExcluirDePagos`. La factura histórica emitida `F26/1334` quedó marcada para excluirla de las consultas de pagos sin borrar el registro fiscal.
- Se validaron previamente los tres PDF con `POST /api/invoices/extract`, sin crear datos: clasificación `invoice`, coincidencia exacta por NIF con el proveedor y validación fiscal satisfactoria.

### Ejecución y resultado

El 18 de septiembre de 2026 se envió un único correo al buzón de pruebas con tres adjuntos PDF digitales. La Function generó un proceso independiente por adjunto.

| Factura | Proveedor | Total | Resultado final |
|---|---|---:|---|
| `EMAS-2026-3001` | Emas Printing Solutions, SL | 79,86 EUR | `completed` tras reintento técnico |
| `ENDESA-2026-4001` | Endesa Energía, S.A. Unipersonal | 145,20 EUR | `completed` |
| `SATINFO-2026-5001` | SATINFO SL | 200,86 EUR | `completed` |

ENDESA y SATINFO se registraron en el primer ciclo. La primera extracción de EMAS recibió HTTP 429 de Document Intelligence F0; el servicio indicó una espera de 27 segundos. No se reenvió el correo: tras desplegar `9da76c4`, el siguiente sondeo reintentó exclusivamente el proceso técnico reintentable y lo dejó `completed` a las `2026-09-18T16:30:40Z`. No se duplicaron las otras dos facturas.

Al cierre de la prueba, las tres filas aparecen en `ConsultaPagosCopilot` con estado `Pendiente`; aún no se han cargado previsiones de pago para ellas. Por tanto, ya se puede comprobar recepción, registro y pendientes, pero las preguntas de fecha prevista o total a pagar en una fecha requieren primero registrar las previsiones en SharePoint.

### Próximo paso

Crear las previsiones en `PrevisionesPagos` y, después, configurar un agente de Copilot Studio con `ConsultaPagosCopilot` como fuente de conocimiento directa. No se utilizará Excel para las consultas operativas.
