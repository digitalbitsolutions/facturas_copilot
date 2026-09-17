# Automatización de facturas con Microsoft 365 y Copilot

Este repositorio contiene el núcleo TypeScript y la documentación de una solución para clasificar, extraer, validar, archivar y consultar facturas recibidas en Microsoft 365, además de importar extractos y conciliar movimientos bancarios. La orquestación local con Ollama es una línea experimental separada y no forma parte inicialmente del circuito productivo.

## Estado

- Fase actual: circuito desplegado Outlook → Azure Function → Microsoft Graph → SharePoint, validado el 10 de septiembre de 2026; la importación programada de extractos también está implementada.
- Núcleo de facturas: validación, nomenclatura, duplicados, estados, excepciones e idempotencia.
- Integración: lectura restringida del buzón y circuito clasificación → extracción → proveedor → validación → archivo conectado con estado persistente en SharePoint; las excepciones se resuelven de forma auditable y actualizan el estado terminal del proceso.
- Conciliación: importación por lotes, normalización, duplicidad y puntuación explicable implementadas; aceptación automática deshabilitada.
- Azure Functions: endpoints de salud, validación, importación y conciliación compilables sobre Runtime 4 / Node.js 24.
- Infraestructura: Bicep para Flex Consumption, Storage, Application Insights, Log Analytics y Key Vault con identidades administradas.
- Arquitectura operativa: Azure Functions, Microsoft Graph, Document Intelligence y SharePoint Lists, sin conectores de automatización externos.
- Pruebas: 74 superadas.
- Ollama: `0.33.3`, API disponible en `http://127.0.0.1:11434`.
- Perfil local activo: **casa** — Intel Core i7-12700T (12 núcleos/20 hilos), 15,7 GB de RAM y NVIDIA GeForce RTX 3050 Ti Laptop GPU (4 GB VRAM). Inventario comprobado el 17 de septiembre de 2026.
- Restricción operativa: un único modelo local cargado y contexto corto.
- PRD funcional vigente: [PRD_Automatizacion_Facturas_M365_Copilot_v4.md](./PRD_Automatizacion_Facturas_M365_Copilot_v4.md).

## Modelos instalados

| Modelo | Parámetros | Cuantización | Capacidades | Papel inicial |
|---|---:|---|---|---|
| `qwen2.5-coder:3b` | 3B | instalada | Código | Modelo principal para tareas de código acotadas y verificables |
| `qwen2.5:3b` | 3B | instalada | Texto y JSON | Modelo principal para clasificación y resúmenes breves |
| `qwen2.5-coder:7b` | 7B | instalada | Código | Comparador de mayor calidad; GPU + CPU |
| `qwen2.5:7b` | 7B | instalada | Texto y JSON | Comparador de mayor calidad; GPU + CPU |
| `deepseek-coder:6.7b` | 6,7B | instalada | Código | Comparador experimental |
| `llama3.1:8b` | 8B | instalada | Generalista | Comparador; no ruta habitual |
| `gemma3:1b` | 1B | instalada | Generalista | Tareas muy breves; no visión de producción |
| `gemma:2b`, `llama3.2:latest`, `mistral:7b` | variados | instalados | Generalistas | No priorizados hasta tener evidencia específica |

El contexto declarado por el modelo no es el contexto operativo. En este hardware se comenzará con 2.048 tokens y se permitirá un máximo ordinario de 4.096.

## Principios

1. Codex conserva la planificación, las decisiones arquitectónicas y la responsabilidad final.
2. Los modelos locales reciben fragmentos mínimos, nunca el repositorio completo.
3. La salida local debe ser estructurada, limitada y verificable.
4. Tests, analizadores y compiladores tienen prioridad sobre la opinión de otro modelo.
5. Una tarea local se escala a Codex al primer indicio de ambigüedad, riesgo o repetición fallida.
6. No se ejecutan modelos locales en paralelo en este equipo.
7. Toda delegación registra tokens estimados evitados, latencia, resultado y retrabajo.

## Plan de orquestación por sesión

Este protocolo se ejecuta al inicio y al cierre de cada sesión de Codex. El objetivo es reducir consumo cloud sin trasladar riesgo, datos sensibles ni retrabajo al equipo.

1. **Identificar el equipo.** Antes de empezar trabajo, Codex preguntará en qué ordenador se trabaja, salvo que el usuario ya lo haya indicado en la sesión. Se registrará el perfil activo y se ajustarán modelo, contexto y expectativas de latencia; nunca se asumirá que dos equipos tienen la misma capacidad.
2. **Situar el trabajo.** Leer `README.md`, `CONTEXT.md` y el apartado relevante de `TODO.md`; comprobar `git status --short` y los últimos commits. No cargar el repositorio completo ni documentación no relacionada.
3. **Clasificar antes de delegar.** Ejecutar directamente tareas deterministas (búsquedas, compilación, pruebas, formato y cambios mecánicos). Reservar Codex para arquitectura, seguridad, integraciones Microsoft 365/Azure, cambios transversales y toda ambigüedad.
4. **Delegación local opcional.** Solo enviar a Ollama texto mínimo, ya seleccionado y sin secretos ni datos fiscales personales. Exigir salida JSON breve y validar el resultado con pruebas, tipos o reglas. Una sola tarea y un solo modelo local simultáneos.
5. **Escalado inmediato.** Si el formato es inválido, la respuesta es ambigua, se detecta un dato sensible, falla una validación o aparece un segundo intento, detener la ruta local y resolver con Codex. No perseverar para justificar el uso del modelo local.
6. **Medir ahorro neto.** Por cada ensayo local registrar: tarea, modelo, tamaño aproximado de entrada/salida, latencia, aceptación directa, correcciones y motivo de escalado. La fórmula es `tokens_cloud_base - tokens_cloud_orquestados - equivalente_del_retrabajo`.
7. **Cerrar con evidencia.** Ejecutar las comprobaciones pertinentes, actualizar solo la documentación afectada y dejar el siguiente paso y bloqueos en `CONTEXT.md` o `TODO.md`. Si no hay evidencia de ahorro o la calidad baja, la ruta local queda desactivada.

### Perfil activo: casa

La RTX 3050 Ti dispone de 4 GB de VRAM, de los que se observaron 3,38 GB libres. Los modelos de 3B instalados son la ruta de baja latencia y se probarán primero: `qwen2.5:3b` para JSON/resúmenes y `qwen2.5-coder:3b` para código. Los modelos de 7B no cabrán por completo en GPU y combinarán GPU y CPU; se reservan como comparadores de calidad. Se usará un único proceso, `num_ctx: 2048` y `num_predict` limitado; cada salida se valida de forma determinista. No se utilizará ningún modelo cloud local ni se descargará un modelo superior a 7B sin una decisión expresa y evidencia de ahorro neto.

## Enrutamiento inicial

```text
Solicitud
   ↓
Reglas deterministas: alcance, riesgo y tamaño
   ├─ alto riesgo/ambigua → Codex
   └─ acotada/verificable → modelo local
                              ↓
                    validación determinista
                       ├─ válida → resultado
                       └─ falla una vez → Codex
```

| Trabajo | Destino |
|---|---|
| Clasificar solicitud, extraer campos, producir JSON | Qwen 3 1.7B |
| Generar tests simples, explicar error corto, proponer parche pequeño | Qwen Coder 3B |
| Analizar una captura o layout | Gemma 3 4B; Ministral como candidato A/B |
| Resumir texto ya seleccionado | Qwen 3 o Qwen 2.5 |
| Arquitectura, seguridad, migraciones, cambios transversales | Codex |
| Revisión final de cambios sensibles | Codex + pruebas deterministas |

## Qué significa ahorro real

```text
ahorro_neto = tokens_cloud_base
             - tokens_cloud_orquestados
             - equivalente_del_retrabajo
```

También se medirán latencia total, tasa de aceptación directa, fallos de formato, escalados y defectos encontrados después. Un flujo local se desactiva si ahorra tokens pero empeora de forma material el tiempo o la calidad.

## Documentación

- [Arquitectura y política de enrutamiento](./docs/ORCHESTRATION_PLAN.md)
- [Protocolo de evaluación](./docs/EVALUATION.md)
- [Política de datos](./docs/DATA_POLICY.md)
- [Resultados del benchmark local](./docs/BENCHMARK_RESULTS.md)
- [Preparación de Microsoft 365](./docs/M365_SETUP.md)
- [Ejecución y diagnóstico del piloto de correo](./docs/MAILBOX_PILOT_RUNBOOK.md)
- [Contratos de la API](./docs/API.md)
- [Matriz de aceptación v3](./docs/ACCEPTANCE_MATRIX.md)
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
