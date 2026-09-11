# Automatización de facturas con Microsoft 365 y Copilot

Este repositorio contiene el núcleo TypeScript y la documentación de una solución para clasificar, extraer, validar, archivar y consultar facturas recibidas en Microsoft 365, además de importar extractos y conciliar movimientos bancarios. La orquestación local con Ollama es una línea experimental separada y no forma parte inicialmente del circuito productivo.

## Estado

- Fase actual: alternativa sin Power Automate Premium desplegada. El circuito real Outlook → Azure Function → Microsoft Graph → SharePoint fue validado el 10 de septiembre de 2026; la importación programada de extractos también está implementada.
- Núcleo de facturas: validación, nomenclatura, duplicados, estados, excepciones e idempotencia.
- Integración: lectura restringida del buzón y circuito clasificación → extracción → proveedor → validación → archivo conectado con estado persistente en SharePoint; las excepciones se resuelven de forma auditable y actualizan el estado terminal del proceso.
- Conciliación: importación por lotes, normalización, duplicidad y puntuación explicable implementadas; aceptación automática deshabilitada.
- Azure Functions: endpoints de salud, validación, importación y conciliación compilables sobre Runtime 4 / Node.js 24.
- Infraestructura: Bicep para Flex Consumption, Storage, Application Insights, Log Analytics y Key Vault con identidades administradas.
- Destino actual sin licencia Premium: Azure Functions + SharePoint Lists; Power Automate y AI Builder quedan opcionales.
- Pruebas: 60 superadas.
- Ollama: `0.33.3`, API disponible en `http://127.0.0.1:11434`.
- Equipo: Intel i5-10210U, 4 núcleos/8 hilos, 7,78 GB RAM, sin GPU dedicada.
- Restricción operativa: un único modelo local cargado y contexto corto.
- PRD funcional vigente sin Power Automate: [PRD_Automatizacion_Facturas_M365_Copilot_v4.md](./PRD_Automatizacion_Facturas_M365_Copilot_v4.md).

## Modelos instalados

| Modelo | Parámetros | Cuantización | Capacidades | Papel inicial |
|---|---:|---|---|---|
| `qwen2.5-coder:3b-instruct` | 3,1B | Q4_K_M | completion, tools, insert | Código y revisión mecánica |
| `qwen3:1.7b` | 2,0B | Q4_K_M | completion, tools, thinking | Router, extracción y JSON |
| `deepseek-r1:1.5b` | 1,8B | Q4_K_M | completion, tools, thinking | Hipótesis puntuales |
| `gemma3:4b` | 4,3B | Q4_K_M | completion, vision | Capturas y documentos visuales |
| `ministral-3:3b` | 3,8B | Q4_K_M | completion, vision, tools | Alternativa agentic/visual |
| `qwen2.5:3b-instruct` | 3,1B | Q4_K_M | completion, tools | Generalista de respaldo |
| `phi3.5:latest` | 3,8B | Q4_0 | completion | Resumen de respaldo |

El contexto declarado por el modelo no es el contexto operativo. En este hardware se comenzará con 2.048 tokens y se permitirá un máximo ordinario de 4.096.

## Principios

1. Codex conserva la planificación, las decisiones arquitectónicas y la responsabilidad final.
2. Los modelos locales reciben fragmentos mínimos, nunca el repositorio completo.
3. La salida local debe ser estructurada, limitada y verificable.
4. Tests, analizadores y compiladores tienen prioridad sobre la opinión de otro modelo.
5. Una tarea local se escala a Codex al primer indicio de ambigüedad, riesgo o repetición fallida.
6. No se ejecutan modelos locales en paralelo en este equipo.
7. Toda delegación registra tokens estimados evitados, latencia, resultado y retrabajo.

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
- [Diseño de Power Automate](./docs/POWER_AUTOMATE_DESIGN.md)
- [Matriz de aceptación v3](./docs/ACCEPTANCE_MATRIX.md)
- [Despliegue GitHub OIDC](./docs/GITHUB_OIDC.md)
- [Contexto de reanudación](./CONTEXT.md)
- [Roadmap](./ROADMAP.md)
- [Trabajo inmediato](./TODO.md)

## Importación bancaria sin Power Automate Premium

Cada diez minutos, la Function revisa `ExtractosBancarios`. Un archivo válido se convierte en registros de las listas `ImportacionesBancarias` y `MovimientosBancarios`, y pasa a `Procesados`. Si falla, registra una excepción y lo mueve a `Errores`. Se usa la primera hoja y las columnas: `IdMovimiento`, `FechaMovimiento`, `FechaValor`, `Concepto`, `Importe`, `Moneda`, `Referencia`, `Contraparte`.

El alta se hace una vez con `scripts/provision-sharepoint-folders.ps1` y `scripts/provision-sharepoint-lists.ps1`; después se configuran los identificadores del sitio y de la biblioteca como ajustes de la Function. No requiere licencia Power Automate Premium.
