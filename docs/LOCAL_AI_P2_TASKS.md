# Batería P2 de orquestación local

Esta batería permite comparar una ejecución de control con Codex frente a la variante local + escalado. No contiene documentos, NIF, direcciones, correos ni secretos reales. Se ejecuta sobre el commit que se anote en el registro de cada ensayo y en un árbol de trabajo desechable para las tareas que generen un diff.

## Protocolo común

- Ejecutar primero el control de Codex y conservar objetivo, contexto y criterios idénticos.
- Ejecutar después la variante local con un único modelo y sin reintentos.
- Usar `qwen2.5:3b` para `C-*` y `qwen2.5-coder:3b` para `K-*`.
- Límites: `num_ctx: 2048`, `temperature: 0`, `keep_alive: 0`; `num_predict: 128` para clasificación y `256` para código.
- Una salida inválida, una propuesta fuera de alcance o un fallo de la comprobación implica escalado a Codex. No se corrige localmente una segunda vez.
- Registrar tokens locales y cloud, latencia total, aceptación en el primer intento, escalado, corrección y resultado de la comprobación en `.local-ai/telemetry.jsonl`. Ese fichero permanece ignorado por Git.

La salida de `C-*` debe ser exclusivamente este JSON: `{"category":"invoice|bank_settlement|other","confidence":0..1,"reasons":["señal"]}`. Se exige categoría exacta, confianza entre 0 y 1 y entre una y tres razones que se correspondan con el extracto. Las salidas de `K-*` deben ser un JSON con `summary`, `targetFile`, `proposedChange` y `validation`; si se solicita un diff, `proposedChange` contiene solo un diff unificado para un archivo.

## Diez tareas de clasificación

| ID | Extracto sintético y encargo | Resultado esperado |
|---|---|---|
| C-01 | `FACTURA Nº A-104; base imponible 100,00 EUR; IVA 21,00 EUR; total 121,00 EUR; fecha de factura 2026-09-01.` Clasifica el documento. | `invoice`; razones de número, base/IVA/total o fecha fiscal. |
| C-02 | `LIQUIDACIÓN DE RECIBOS; fecha valor 2026-09-03; intereses 0,12; comisiones 1,50; gastos 0,30.` Clasifica el documento. | `bank_settlement`; razones de liquidación, fecha valor o cargos bancarios. |
| C-03 | `Currículum vitae. Experiencia profesional, formación y disponibilidad.` Clasifica el documento. | `other`; razones de ausencia de señales fiscales y contenido profesional. |
| C-04 | `Factura simplificada; ticket 0042; total 18,15 EUR; IVA incluido.` Clasifica el documento. | `invoice`; razón de factura/ticket y total/IVA. |
| C-05 | `Extracto de movimientos. Saldo inicial 1.200,00; abono 400,00; cargo 90,00; saldo final 1.510,00.` Clasifica el documento. | `other`; es un extracto, no una liquidación ni una factura. |
| C-06 | `Aviso de pago pendiente. Referencia de pedido P-88. No es factura. Consulte condiciones.` Clasifica el documento. | `other`; la negación explícita impide clasificarlo como factura. |
| C-07 | `FACTURA; referencia F-9; importe total 40,00 EUR; vencimiento 2026-10-15.` Clasifica el documento. | `invoice`; encabezado de factura e importe/vencimiento. |
| C-08 | `Liquidación bancaria de tarjetas; nominal abonado 845,22; fecha valor 2026-09-05; comisión 2,20.` Clasifica el documento. | `bank_settlement`; señales bancarias concurrentes. |
| C-09 | `Oferta comercial: mantenimiento anual 500 EUR. Validez de la oferta: 30 días.` Clasifica el documento. | `other`; oferta sin evidencias fiscales de factura. |
| C-10 | `Recibo domiciliado; mandato SEPA; importe cargado 72,00 EUR; fecha valor 2026-09-08.` Clasifica el documento. | `bank_settlement`; recibo, cargo y fecha valor. |

## Diez tareas pequeñas de código

Todas usan solo el archivo indicado como contexto. No se permite editar otro archivo, cambiar dependencias, acceder a red ni modificar infraestructura.

| ID | Objetivo y archivo de contexto | Salida y aceptación |
|---|---|---|
| K-01 | Propón un caso de prueba para que `redactSecrets` oculte un token Bearer. Archivo: `src/local-ai/local-ai.test.ts`. | JSON de propuesta; el caso debe invocar la función y afirmar que el token no aparece. Revisión humana del caso. |
| K-02 | Propón un caso de prueba que garantice que `routeTask` escala a Codex después de un fallo local. Archivo: `src/local-ai/local-ai.test.ts`. | JSON de propuesta con `failedLocally: true` y aserción exacta `codex`. |
| K-03 | Propón un caso de prueba para un CSV cuyo concepto contiene una coma entre comillas. Archivo: `src/microsoft365/bank-poller.test.ts`. | JSON de propuesta; debe comprobar que el campo no se divide. |
| K-04 | Propón un caso de prueba que rechace una previsión con estado `Pagado`. Archivo: `src/payment-forecasts/payment-forecasts.test.ts`. | JSON de propuesta; debe comprobar rechazo y no promoción de estado. |
| K-05 | Propón un caso de prueba que impida derivar una base imponible cero cuando IVA y total coinciden. Archivo: `src/extraction/document-intelligence.test.ts`. | JSON de propuesta; debe comprobar la ausencia de base derivada. |
| K-06 | Devuelve un diff unificado para añadir a `src/local-ai/local-ai.test.ts` una prueba que limite `numCtx` a 4096 cuando se solicitan 9000. | Diff de un archivo; se aplica en árbol desechable y `npm test` debe pasar. |
| K-07 | Devuelve un diff unificado para añadir a `src/local-ai/local-ai.test.ts` una prueba que limite `numPredict` a 512 cuando se solicitan 900. | Diff de un archivo; se aplica en árbol desechable y `npm test` debe pasar. |
| K-08 | Devuelve un diff unificado para añadir a `src/invoices/invoices.test.ts` una prueba de normalización de proveedor que elimine acentos y puntuación. | Diff de un archivo; se aplica en árbol desechable y `npm test` debe pasar. |
| K-09 | Devuelve un diff unificado para añadir a `src/microsoft365/bank-poller.test.ts` una prueba que rechace extensión `.pdf`. | Diff de un archivo; se aplica en árbol desechable y `npm test` debe pasar. |
| K-10 | Devuelve un diff unificado para añadir a `src/payment-forecasts/payment-forecasts.test.ts` una prueba de idempotencia ante el mismo hash lógico de origen. | Diff de un archivo; se aplica en árbol desechable y `npm test` debe pasar. |

## Cierre P2

No se promociona un modelo por el promedio de las veinte tareas. Para cada pareja `tipo + modelo`, calcular aceptación sin retrabajo, escalado, mediana de tokens cloud evitados, latencia y defectos escapados. Solo se adopta una ruta si alcanza los umbrales de `ORCHESTRATION_PLAN.md`: al menos 70 % de aceptación, cero defectos críticos y una reducción mediana de tokens cloud de al menos 30 %.

El control de Codex de clasificación se conserva en `fixtures/local-ai/p2-codex-classification-control.json`. Cuando la superficie de Codex no exponga sus tokens o latencia, esos valores se registran como no disponibles: no se infieren desde caracteres, estimaciones ni métricas de Ollama.
