# Benchmark local de modelos

Fecha: 7 de septiembre de 2026.

## Configuración

- Ejecución secuencial mediante Ollama 0.33.3.
- `num_ctx`: 2.048.
- `num_predict`: 64.
- Temperatura: 0; semilla: 42.
- `keep_alive`: 0 para descargar cada modelo antes del siguiente.
- Tarea idéntica de clasificación con salida JSON.
- Equipo: Intel i5-10210U, 7,78 GB RAM, sin GPU dedicada.

## Resultados

| Modelo | Latencia | Carga | Salida | Velocidad | JSON válido |
|---|---:|---:|---:|---:|---|
| `deepseek-r1:1.5b` | 12,91 s | 7,36 s | 64 tokens | 13,10 tok/s | No |
| `qwen3:1.7b` | 15,41 s | 8,72 s | 64 tokens | 10,98 tok/s | No |
| `qwen2.5:3b-instruct` | 17,20 s | 10,20 s | 29 tokens | 6,22 tok/s | Sí |
| `qwen2.5-coder:3b-instruct` | 21,09 s | 11,98 s | 39 tokens | 5,77 tok/s | Sí |
| `phi3.5:latest` | 27,09 s | 11,20 s | 64 tokens | 5,42 tok/s | No |
| `gemma3:4b` | 28,90 s | 21,35 s | 26 tokens | 4,76 tok/s | Sí |
| `ministral-3:3b` | 62,53 s | 16,90 s | 64 tokens | 4,51 tok/s | No |

La velocidad usa `eval_count / eval_duration` de Ollama y excluye la carga. La latencia sí representa la espera completa percibida con el modelo descargado inicialmente.

## Lectura inicial

- `qwen2.5:3b-instruct` ofrece el mejor equilibrio en esta prueba estructurada: JSON válido y menor latencia entre las respuestas válidas.
- `qwen2.5-coder:3b-instruct` queda como candidato de código, aunque necesita una batería específica de generación de pruebas y parches.
- `gemma3:4b` produjo JSON válido, pero su coste de carga es alto; debe reservarse para evaluación visual.
- Qwen 3, DeepSeek, Phi y Ministral agotaron los 64 tokens sin cerrar JSON. En modelos con razonamiento esto no permite concluir que fallen con un presupuesto normal; la siguiente prueba debe desactivar razonamiento cuando sea posible y separar texto visible de razonamiento.
- Ministral fue el más lento en esta máquina para esta tarea y no conviene como ruta textual habitual.

Los datos completos y legibles por máquina están en `.local-ai/benchmark-latest.json` y no se versionan.

## Perfil casa — prueba técnica inicial, 17 de septiembre de 2026

Equipo: Intel Core i7-12700T, 15,7 GB RAM y RTX 3050 Ti Laptop GPU con 4 GB VRAM. Se ejecutó un único modelo cada vez, mediante Ollama local, con `num_ctx: 2048`, `num_predict: 64`, temperatura `0`, semilla `42`, `keep_alive: 0` y el mismo encargo JSON. El validador comprobó las claves y tipos esperados, no solo que el texto fuese JSON sintácticamente válido.

| Modelo | Latencia | Carga | Velocidad | Salida válida |
|---|---:|---:|---:|---|
| `qwen2.5:3b` | 3,21 s | 2,52 s | 54,69 tok/s | Sí |
| `qwen2.5-coder:3b` | 5,11 s | 3,55 s | 54,44 tok/s | Sí |
| `qwen2.5:7b` | 12,39 s | 7,25 s | 13,13 tok/s | Sí |
| `qwen2.5-coder:7b` | 10,93 s | 7,14 s | 11,85 tok/s | Sí |

Conclusión provisional: los dos Qwen 3B son la ruta preferida para tareas locales breves y verificables. El 3B general se descargó íntegramente a GPU durante la prueba; los 7B muestran una penalización clara de carga y generación compatible con descarga parcial GPU/CPU. Esta prueba técnica no demuestra todavía ahorro neto: falta la P2 con tareas representativas, control de Codex, aceptación y retrabajo.

## P2 — primera ejecución sobre el perfil casa, 17 de septiembre de 2026

La batería versionada está en `docs/LOCAL_AI_P2_TASKS.md`; los registros de cada ejecución permanecen en `.local-ai/` y no se versionan. Se mantuvo un único modelo, contexto de 2.048, temperatura `0`, `keep_alive: 0` y cero reintentos.

| Pareja evaluada | Resultado local | Comparación / decisión |
|---|---:|---|
| Clasificación sintética + `qwen2.5:3b` | 7/10 (70 %), 4,44 s de latencia mediana, 3 escalados | El control de Codex clasificó 10/10. La ruta local alcanza el mínimo de aceptación, pero no se habilita por defecto hasta disponer de tokens cloud reales y demostrar ahorro neto. |
| Código pequeño + `qwen2.5-coder:3b` | 0/10 (0 %), 8,77 s de latencia mediana, 10 escalados | Descartada para la ruta local: cinco propuestas no cumplieron el contrato y cinco diffs devolvieron JSON inválido. |

El control de clasificación de Codex está versionado en `fixtures/local-ai/p2-codex-classification-control.json`. La interfaz usada para Codex no expone sus tokens ni su latencia interna; por ello no se calcula ni se declara una reducción de tokens cloud. La decisión operativa provisional es **Codex como ruta predeterminada**. Solo se reconsiderará la clasificación local con una métrica cloud verificable y una batería ampliada; el código local no se reintentará en esta P2.
