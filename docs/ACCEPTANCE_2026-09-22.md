# Evidencia de aceptación — previsiones de pago y consultas Copilot

Fecha: 22 de septiembre de 2026  
Entorno: `dev` / sitio SharePoint `facturas` / agente `Asistente de pagos`

## Objetivo

Validar la importación de un libro de previsiones y la consulta de fecha de vencimiento y fecha prevista de pago desde `ConsultaPagosCopilot`.

## Muestra

Se usó `Prevision_Pagos_piloto.xlsx`, hoja `PrevisionPagos`, con tres previsiones:

| Previsión | Factura | Estado | Fecha prevista de pago |
|---|---|---|---|
| `PREV-2026-0001` | `EMAS-2026-3001` | `Programado` | 28/09/2026 |
| `PREV-2026-0002` | `ENDESA-2026-4001` | `Programado` | 29/09/2026 |
| `PREV-2026-0003` | `SATINFO-2026-5001` | `Programado` | 30/09/2026 |

El importador local leyó las tres filas y las aceptó sin incidencias.

## Resultado observado en el tenant

- El sondeo de las 16:40:15 CEST persistió las tres filas en `PrevisionesPagos` y creó un lote de tres previsiones.
- `ConsultaPagosCopilot` reflejó las tres facturas como `Programado`, con las fechas previstas de pago indicadas.
- El agente `Asistente de pagos` respondió correctamente a la consulta de EMAS: identificó la factura `EMAS-2026-3001`, su vencimiento registrado de 20/10/2026 y su fecha prevista de pago de 28/09/2026. Distinguió ambos conceptos.

La fecha de vencimiento de la proyección procede de `RegistroFacturas` (la fuente fiscal); la fecha prevista de pago procede de `PrevisionesPagos` (decisión operativa). No se deben intercambiar ni inferir una a partir de la otra.

## Incidencia observada

Tras persistir los datos, el archivo terminó en `ErroresPrevisiones` por HTTP 409 al intentar moverlo a `ProcesadosPrevisiones`: ya existía un archivo con el mismo nombre de una prueba anterior. Es un fallo de archivado posterior a la persistencia, no de validación ni de consulta.

## Correcciones y aceptación final

Se aprovisionó `HistorialPrevisiones` y se desplegaron `a1da85e`, `a63f6a8` y `8d1863c`.

- Una previsión con el mismo `PrevisionId` se actualiza de forma auditable.
- `Programado` sin fecha prevista se rechaza; `Pendiente` admite fecha vacía y limpia el campo de SharePoint.
- La colisión de nombre al archivar se resuelve con un sufijo estable.
- Un replay con el mismo contenido no genera un segundo lote efectivo ni duplica previsiones.
- La comparación ignora metadatos de lote/archivo y normaliza las fechas ISO que devuelve Graph.

Prueba final: `Prevision_Pagos_iso_final.xlsx` terminó en `ProcesadosPrevisiones`; su lote registró `PrevisionesImportadas = 1` y `HistorialPrevisiones` registró únicamente `PREV-2026-0001` como `Actualizada`. Quedan validadas las actualizaciones selectivas sin falsos cambios.

## Pendientes operativos

1. Alinear las fechas de factura y vencimiento del Excel con los documentos fiscales cuando difieran; `RegistroFacturas` es la fuente de vencimiento para la consulta operativa.

## Aceptación de presentación de importes

El 24 de septiembre se añadieron a `ConsultaPagosCopilot` los campos de presentación de importe, se desplegó la Function y se incorporaron como instrucciones persistentes del agente. En una conversación nueva, la consulta «¿Cuál es el importe pendiente de la factura EMAS-2026-3001?» recuperó una única factura y respondió `79,86 EUR`, con estado `Programado` y vencimiento `2026-10-20`. No mostró ni convirtió el valor interno `7986` en céntimos.

## Corrección de previsión sin fecha

En la prueba de agregación por periodo se detectó que la proyección mantenía una `FechaPagoPrevista` histórica cuando una previsión pasaba a `Pendiente` sin fecha. El commit `4fc7eaf` limpia explícitamente ese campo al actualizar una fila existente. Tras el despliegue, una sincronización real dejó ENDESA como `Pendiente` sin fecha, EMAS con fecha `01/10/2026` y SATINFO como único pago previsto entre el 28 y el 30 de septiembre, por `200,86 EUR`. Falta repetir la consulta en el agente para aceptar CA-10.
