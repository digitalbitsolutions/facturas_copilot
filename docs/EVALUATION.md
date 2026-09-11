# Protocolo de evaluación

## Piloto con documentos reales — 10 de septiembre de 2026

Se evaluaron cuatro documentos autorizados con `prebuilt-invoice` API `2024-11-30`, nivel F0 y páginas 1-2. Los PDF y las respuestas sin anonimizar permanecen fuera de Git.

| Caso | Resultado | Decisión |
|---|---|---|
| Factura con base, IVA y total explícitos | Los tres importes fueron extraídos y resultaron aritméticamente coherentes | Candidata a validación automática según confianza |
| Factura con total e IVA, sin `SubTotal` estructurado | La base podía derivarse mediante total menos IVA; la confianza fiscal era inferior al umbral | Revisión humana |
| Factura sin desglose fiscal | El modelo extrajo total, pero no base ni IVA | Revisión humana, sin inventar importes |
| Liquidación bancaria | El modelo la trató como factura y confundió el IVA con el total | Clasificación previa y revisión; nunca derivar base cero |

Hallazgos aplicados al código: preferencia por razón social completa, derivación conservadora de base solo cuando total es estrictamente mayor que IVA, propagación de la menor confianza y rechazo de la derivación cuando total e IVA coinciden.

### Validación extremo a extremo

Tras desplegar los ajustes, una factura completa se envió desde Cloud Shell al endpoint autenticado `/api/invoices/extract`. La cadena Entra → Function → identidad administrada → Document Intelligence → mapeo → validación finalizó correctamente. Los importes extraídos fueron coherentes (`166,00 + 34,86 = 200,86 EUR`), pero la validación exigió revisión por confianza inferior a `0,8` en proveedor (`0,76`), número (`0,71`), vencimiento (`0,654`) y base (`0,438`). Fecha, IVA, total y moneda superaron el umbral.

Decisión: no reducir indiscriminadamente el umbral global. Se mantiene `0,8` como respaldo y se introducen umbrales explícitos por campo, combinados con las reglas deterministas existentes. Con esta política, el perfil observado puede validarse porque base, IVA y total son completos y coherentes; un total por debajo de `0,9` o cualquier incoherencia fiscal continúa forzando revisión. La identificación contra el maestro de proveedores y la clasificación documental previa siguen pendientes antes de automatizar el buzón.

## Objetivo

Demostrar si la orquestación local produce ahorro neto frente al flujo íntegramente ejecutado por Codex.

## Diseño del experimento

Crear una batería de tareas reales y anonimizadas:

- 10 clasificaciones/extracciones;
- 10 resúmenes de errores o requisitos;
- 10 generaciones de tests;
- 10 parches pequeños de frontend/backend;
- 5 revisiones visuales.

Cada tarea se ejecutará como control con Codex y como variante local + escalado. Se conservarán exactamente el objetivo y los criterios de aceptación.

## Métricas

| Métrica | Definición |
|---|---|
| Cloud input tokens | Tokens enviados a Codex |
| Cloud output tokens | Tokens generados por Codex |
| Local tokens | Entrada y salida de Ollama |
| Latencia total | Inicio hasta resultado validado |
| First-pass acceptance | Resultado aceptado sin corrección |
| Escalation rate | Porcentaje que termina en Codex |
| Rework | Tiempo/tokens para corregir resultado local |
| Defect escape | Error detectado después de aceptar |

## Registro JSONL propuesto

```json
{"task_id":"...","category":"code_patch","route":"local","model":"qwen2.5-coder:3b-instruct","prompt_tokens_local":0,"completion_tokens_local":0,"cloud_input_tokens":0,"cloud_output_tokens":0,"latency_ms":0,"accepted_first_pass":false,"escalated":false,"tests_passed":false,"prompt_version":"v1"}
```

## Validación

- JSON: validación contra esquema.
- Código: parseo, formato, lint, typecheck y tests.
- Resumen: verificación de referencias y muestreo humano.
- Visión: comparación con una ficha de observaciones conocida.
- Enrutamiento: matriz de riesgo y revisión de falsos locales.

## Decisión

Promover, ajustar o retirar cada pareja `categoría + modelo`. No se evaluará un promedio global que oculte categorías deficientes.

