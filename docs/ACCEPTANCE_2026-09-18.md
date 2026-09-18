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
