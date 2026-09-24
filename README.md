# Automatización de facturas con Microsoft 365 y Copilot

Este repositorio contiene el núcleo TypeScript y la documentación de una solución para clasificar, extraer, validar, archivar y consultar facturas recibidas en Microsoft 365, además de importar extractos y conciliar movimientos bancarios. El desarrollo asistido se realiza exclusivamente con Codex.

## Estado

- Fase actual: circuito desplegado Outlook → Azure Function → Microsoft Graph → SharePoint, validado el 10 de septiembre de 2026; la importación programada de extractos también está implementada.
- Núcleo de facturas: validación, nomenclatura, duplicados, estados, excepciones e idempotencia.
- Integración: lectura restringida del buzón y circuito clasificación → extracción → proveedor → validación → archivo conectado con estado persistente en SharePoint; las excepciones se resuelven de forma auditable y actualizan el estado terminal del proceso.
- Conciliación: importación por lotes, normalización, duplicidad y puntuación explicable implementadas; aceptación automática deshabilitada.
- Azure Functions: endpoints de salud, validación, importación y conciliación compilables sobre Runtime 4 / Node.js 24.
- Infraestructura: Bicep para Flex Consumption, Storage, Application Insights, Log Analytics y Key Vault con identidades administradas.
- Arquitectura operativa: Azure Functions, Microsoft Graph, Document Intelligence y SharePoint Lists, sin conectores de automatización externos.
- Pruebas: 77 superadas.
- Política de desarrollo vigente: **solo Codex** para desarrollo, revisión y generación de código. Las pruebas previas con modelos locales no demostraron ahorro neto y quedan descartadas.
- PRD funcional vigente: [PRD_Automatizacion_Facturas_M365_Copilot_v4.md](./PRD_Automatizacion_Facturas_M365_Copilot_v4.md).

## Principios

1. Codex conserva la planificación, las decisiones arquitectónicas y la responsabilidad final.
2. Tests, analizadores y compiladores validan los cambios antes de integrarlos.
3. Las decisiones de arquitectura, seguridad, despliegue e integraciones Microsoft 365/Azure se revisan explícitamente.
4. No se emplean modelos locales para desarrollar, revisar o generar código.

## Protocolo de trabajo por sesión

Este protocolo se ejecuta al inicio y al cierre de cada sesión de Codex.

1. **Situar el trabajo.** Leer `README.md`, `CONTEXT.md` y el apartado relevante de `TODO.md`; comprobar `git status --short` y los últimos commits. No cargar el repositorio completo ni documentación no relacionada.
2. **Ejecutar y verificar.** Aplicar directamente las tareas deterministas y validar los cambios con pruebas, tipos, compilación o formato según corresponda.
3. **Cerrar con evidencia.** Actualizar únicamente la documentación afectada y dejar el siguiente paso o bloqueo en `CONTEXT.md` o `TODO.md`.

## Documentación

- [Preparación de Microsoft 365](./docs/M365_SETUP.md)
- [Ejecución y diagnóstico del piloto de correo](./docs/MAILBOX_PILOT_RUNBOOK.md)
- [Contratos de la API](./docs/API.md)
- [Matriz de aceptación v3](./docs/ACCEPTANCE_MATRIX.md)
- [Cambios del 24 de septiembre de 2026](./docs/CHANGELOG_2026-09-24.md)
- [Reinicio seguro de datos de prueba](./docs/DATA_RESET_RUNBOOK.md)
- [Despliegue GitHub OIDC](./docs/GITHUB_OIDC.md)
- [Contexto de reanudación](./CONTEXT.md)
- [Roadmap](./ROADMAP.md)
- [Trabajo inmediato](./TODO.md)

## Importación bancaria programada

Cada diez minutos, la Function revisa `ExtractosBancarios`. Un archivo válido se convierte en registros de las listas `ImportacionesBancarias` y `MovimientosBancarios`, y pasa a `Procesados`. Si falla, registra una excepción y lo mueve a `Errores`. Se usa la primera hoja y las columnas: `IdMovimiento`, `FechaMovimiento`, `FechaValor`, `Concepto`, `Importe`, `Moneda`, `Referencia`, `Contraparte`.

El alta se hace una vez con `scripts/provision-sharepoint-folders.ps1` y `scripts/provision-sharepoint-lists.ps1`; después se configuran los identificadores del sitio y de la biblioteca como ajustes de la Function.

## Previsión de pagos — estado y siguiente paso

La previsión de pagos es un insumo operativo independiente de las facturas recibidas: parte de las facturas pendientes y añade la fecha e importe de pago previstos, estado, referencia y observaciones. No acredita que una factura haya sido pagada; la confirmación procede exclusivamente de la conciliación con el extracto bancario.

El 16 de septiembre de 2026 se revisó el borrador `assets/facturas-prueba/Prevision_Pagos.xlsx`. Contiene las hojas `PrevisionPagos`, `Resumen` y `Excluidas`, una tabla con las 17 columnas previstas y validaciones de valores. Es un buen borrador de operación, pero todavía **no debe cargarse en SharePoint ni importarse**.

Correcciones necesarias antes de aceptarlo como muestra de importación:

1. Mover `F26/1334` de EMAS a `Excluidas`: es una factura emitida a un cliente y representa un cobro, no un pago pendiente a proveedor.
2. Marcar la fila de Endesa como `RequiereRevision = Sí` hasta confirmar en el extracto el cargo por domiciliación indicado para el 12/09/2026.
3. Recalcular el resumen tras excluir EMAS: dos facturas y 588,07 EUR pendientes; sustituir los valores estáticos del resumen por fórmulas o recalcularlos en el futuro importador.
4. Eliminar referencias fijas a “vencida a 16/09/2026” en observaciones; usar una nota temporalmente neutra, como “Pendiente de conciliación contra extracto bancario”.

Además, la librería actual del proyecto (`xlsx-populate`) no puede abrir este XLSX por la estructura de su hoja de estilos, aunque el contenido sea legible por Excel. Antes de implementar el importador se debe guardar de nuevo con Microsoft Excel o generar un archivo mínimo compatible y añadir una prueba de regresión que lo lea con el parser elegido.

El contrato `payment-forecast-v1` y el importador separado ya están implementados. Lee exclusivamente `PrevisionPagos`, exige sus 17 columnas, conserva nombre y hash de origen, valida fechas, importes, moneda, estado y revisión, e identifica duplicados de forma idempotente. Rechaza explícitamente `Pagado` o `Pagada`: una previsión nunca cambia a pagada sin una decisión humana respaldada por conciliación bancaria. El siguiente paso es persistir los lotes y previsiones validados en listas SharePoint y activar su importación programada de forma controlada.

## Consultas operativas de pagos

`ConsultaPagosCopilot` es una lista SharePoint derivada, actualizada cada diez minutos, que reúne facturas, previsiones y conciliaciones en una fila consultable por documento. Es la fuente operativa de las preguntas de pagos; no se consulta Excel para este fin. Una factura solo pasa a `Pagada` tras una conciliación humana confirmada. La marca `RegistroFacturas.ExcluirDePagos` mantiene documentos fiscales que no son cuentas a pagar fuera de esta lista, sin eliminarlos del registro.

Para comprobar consultas en lenguaje natural se usará un agente de Copilot Studio conectado directamente a esta lista. El Copilot general de Microsoft 365 no se considera una fuente fiable para estas consultas hasta que se configure y valide dicha conexión.
