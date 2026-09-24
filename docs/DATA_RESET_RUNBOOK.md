# Reinicio de datos de prueba

Este procedimiento elimina **solo datos operativos de prueba** para comenzar una campaña nueva. No borra listas, columnas, carpetas, configuración ni proveedores. Debe ejecutarlo un propietario del sitio y de la Function App.

> No ejecutar contra producción. Antes de empezar, exportar o conservar la evidencia de aceptación que se quiera mantener.

## Registro de ejecución actual

- 24 de septiembre de 2026: paso 1 completado. La Function App de desarrollo `func-facturas-copilot-dev-jbhyjbgfzr3iy` quedó detenida (`The site is stopped`). No se debe reactivar hasta terminar los pasos de limpieza y verificación.
- 24 de septiembre de 2026: se eliminaron los PDFs de prueba de las carpetas de proveedor bajo `Facturas`; las carpetas de proveedor se conservaron.
- 24 de septiembre de 2026: se eliminaron los archivos de prueba de `Procesados`, `Errores`, `ProcesadosPrevisiones` y `ErroresPrevisiones`; se conservaron todas las carpetas.
- 24 de septiembre de 2026: se vació la proyección derivada `ConsultaPagosCopilot`.
- 24 de septiembre de 2026: se vació la lista `Conciliaciones`, incluidos los casos sintéticos CA-17 a CA-21.
- 24 de septiembre de 2026: se vaciaron `MovimientosBancarios` e `ImportacionesBancarias`.
- 24 de septiembre de 2026: se vaciaron `HistorialPrevisiones`, `PrevisionesPagos` e `ImportacionesPrevisiones`.

## Elementos que se conservan

- La biblioteca, las carpetas raíz y las subcarpetas de proveedor de [Facturas](https://integramente.sharepoint.com/sites/facturas/Shared%20Documents/Facturas).
- La lista [MaestroProveedores](https://integramente.sharepoint.com/sites/facturas/Lists/MaestroProveedores): **no borrar proveedores**.
- La lista [ConfiguracionConciliacion](https://integramente.sharepoint.com/sites/facturas/Lists/ConfiguracionConciliacion).
- La carpeta [Configuracion](https://integramente.sharepoint.com/sites/facturas/Shared%20Documents/Configuracion), incluidos sus libros de referencia.
- La infraestructura Azure, ajustes no secretos, permisos y la definición del agente de Copilot.

## 1. Detener temporalmente los sondeos

Antes de borrar estados, detener la **Function App completa**. Es la única forma actual de detener a la vez los sondeos de facturas, extractos bancarios, previsiones y la sincronización de consultas.

En Azure Portal:

1. Abrir la [Function App de desarrollo](https://portal.azure.com/#@integramente.onmicrosoft.com/resource/subscriptions/e7e239ec-59fb-4128-b9e1-b7854f426f4d/resourceGroups/rg-facturas-copilot-dev/providers/Microsoft.Web/sites/func-facturas-copilot-dev-jbhyjbgfzr3iy/overview).
2. Seleccionar **Stop** y esperar a que el estado sea `Stopped`.
3. Realizar la limpieza de los pasos siguientes.

Como protección adicional antes de reanudar, establecer estos dos ajustes en `false`:

| Ajuste | Valor temporal |
|---|---|
| `INVOICE_PROCESSING_ENABLED` | `false` |
| `PAYMENT_FORECAST_IMPORT_ENABLED` | `false` |

Al reactivar facturas, establecer también `INVOICE_PROCESSING_NOT_BEFORE` con una fecha UTC posterior al último correo de prueba que se quiera ignorar. De lo contrario, al borrar `ProcesosFacturas` el sondeo puede volver a procesar correos históricos que aún estén en el buzón.

No dejar archivos de prueba en las carpetas de entrada mientras los sondeos estén activos. Al final del procedimiento, seleccionar **Start** en la misma página de Azure Portal.

## 2. Borrar archivos de prueba, sin borrar carpetas

Abrir cada enlace y eliminar **sus archivos de prueba**, manteniendo las carpetas indicadas:

| Ubicación | Acción |
|---|---|
| [Facturas](https://integramente.sharepoint.com/sites/facturas/Shared%20Documents/Facturas) | Borrar los PDF de prueba dentro de las carpetas de proveedor; conservar las carpetas de proveedor. |
| [ExtractosBancarios](https://integramente.sharepoint.com/sites/facturas/Shared%20Documents/ExtractosBancarios) | Borrar extractos pendientes de prueba. |
| [Procesados](https://integramente.sharepoint.com/sites/facturas/Shared%20Documents/Procesados) | Borrar extractos bancarios ya procesados de prueba. |
| [Errores](https://integramente.sharepoint.com/sites/facturas/Shared%20Documents/Errores) | Borrar extractos bancarios de prueba con error. |
| [PrevisionesPagos](https://integramente.sharepoint.com/sites/facturas/Shared%20Documents/PrevisionesPagos) | Borrar libros de previsiones pendientes de prueba. |
| [ProcesadosPrevisiones](https://integramente.sharepoint.com/sites/facturas/Shared%20Documents/ProcesadosPrevisiones) | Borrar libros de previsiones procesados de prueba. |
| [ErroresPrevisiones](https://integramente.sharepoint.com/sites/facturas/Shared%20Documents/ErroresPrevisiones) | Borrar libros de previsiones de prueba con error. |

En el buzón compartido `facturas-pruebas`, borrar o mover fuera de `Inbox` los correos de prueba que no deban volver a procesarse. No borrar correos reales.

## 3. Vaciar las listas operativas

Abrir cada lista y eliminar todos los elementos de prueba. **No eliminar la lista ni sus columnas.** Hacerlo en este orden para no dejar referencias derivadas:

1. [ConsultaPagosCopilot](https://integramente.sharepoint.com/sites/facturas/Lists/ConsultaPagosCopilot) — proyección derivada.
2. [Conciliaciones](https://integramente.sharepoint.com/sites/facturas/Lists/Conciliaciones) — incluye el caso sintético `CA21`.
3. [MovimientosBancarios](https://integramente.sharepoint.com/sites/facturas/Lists/MovimientosBancarios).
4. [ImportacionesBancarias](https://integramente.sharepoint.com/sites/facturas/Lists/ImportacionesBancarias).
5. [HistorialPrevisiones](https://integramente.sharepoint.com/sites/facturas/Lists/HistorialPrevisiones).
6. [PrevisionesPagos](https://integramente.sharepoint.com/sites/facturas/Lists/PrevisionesPagos).
7. [ImportacionesPrevisiones](https://integramente.sharepoint.com/sites/facturas/Lists/ImportacionesPrevisiones).
8. [Excepciones](https://integramente.sharepoint.com/sites/facturas/Lists/Excepciones).
9. [RegistroFacturas](https://integramente.sharepoint.com/sites/facturas/Lists/RegistroFacturas) — incluye la factura sintética `CA21-FACTURA-82316bb87a82`.
10. [ProcesosFacturas](https://integramente.sharepoint.com/sites/facturas/Lists/ProcesosFacturas).

Si existen elementos no destinados a esta campaña, filtrarlos antes de eliminar por `ArchivoOrigen`, `LoteId`, `ProcessId`, `NumeroFactura` o el prefijo `CA21`.

## 4. Comprobar el reinicio

Antes de reactivar procesos, confirmar:

- `Facturas` mantiene sus carpetas de proveedor y no contiene PDFs de prueba.
- Las diez listas operativas anteriores no contienen elementos de la campaña anterior.
- `MaestroProveedores` y `ConfiguracionConciliacion` siguen intactas.
- No hay archivos de prueba en las carpetas de entrada.
- El buzón no conserva correos de prueba que puedan reprocesarse.

Ejecutar una sincronización de `ConsultaPagosCopilot` o esperar al siguiente ciclo para que permanezca vacía tras limpiar las fuentes.

## 5. Reactivar y comenzar una campaña nueva

1. Fijar `INVOICE_PROCESSING_NOT_BEFORE` a la hora UTC de inicio de la nueva campaña.
2. Cambiar `INVOICE_PROCESSING_ENABLED` y `PAYMENT_FORECAST_IMPORT_ENABLED` a `true` solo cuando las carpetas de entrada estén listas.
3. Cargar un único documento de prueba autorizado y comprobar proceso, registro, PDF y proyección antes de continuar con el resto.

El reinicio no revierte código ni despliegues. Los nuevos PDF usarán el patrón `Facturas/<PROVEEDOR>/<NUMERO_FACTURA>_<AAAA-MM-DD>_<IMPORTE>_<MONEDA>.pdf`.
