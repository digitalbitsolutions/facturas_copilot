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

## Pendientes

1. Desplegar la corrección local de archivado: ante una colisión de nombre, usar un nombre alternativo estable y no declarar fallido un lote ya persistido.
2. Desplegar la corrección local de fechas: `FechaPagoPrevista` vacía se omite al crear y se limpia con `null` al actualizar. Un Excel con la fecha vacía es válido si `EstadoPrevision` es `Pendiente`.
3. Desplegar la validación local: `Programado` exige `FechaPagoPrevista`; si Gerencia/Cliente aún no la ha fijado, el estado debe ser `Pendiente`.
4. Aprovisionar la nueva lista `HistorialPrevisiones` y registrar el resultado de la prueba de actualización y replay en el tenant.
5. Mejorar la presentación del agente: mostrar importes en EUR, no solo el valor interno en céntimos.
6. Alinear las fechas de factura y vencimiento del Excel con los documentos fiscales cuando difieran; `RegistroFacturas` es la fuente de vencimiento para la consulta operativa.
