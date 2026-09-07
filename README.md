# Orquestación local para desarrollo y automatizaciones

Este repositorio desarrollará una capa de orquestación que use modelos locales de Ollama para trabajo mecánico y reserve Codex para tareas de mayor riesgo o complejidad. El objetivo no es usar IA local por principio, sino reducir **tokens cloud totales y coste** sin aumentar errores, latencia o retrabajo.

## Estado

- Fase actual: diseño y línea base.
- Ollama: `0.33.3`, API disponible en `http://127.0.0.1:11434`.
- Equipo: Intel i5-10210U, 4 núcleos/8 hilos, 7,78 GB RAM, sin GPU dedicada.
- Restricción operativa: un único modelo local cargado y contexto corto.
- PRD funcional del proyecto de facturas: [PRD_Automatizacion_Facturas_M365_Copilot_v2.md](./PRD_Automatizacion_Facturas_M365_Copilot_v2.md).

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
- [Roadmap](./ROADMAP.md)
- [Trabajo inmediato](./TODO.md)

## Próximo hito

Construir un adaptador mínimo para Ollama, un router basado primero en reglas y un registro JSONL de métricas. Antes de integrarlo con Codex se ejecutará una batería controlada de tareas reales del proyecto.
