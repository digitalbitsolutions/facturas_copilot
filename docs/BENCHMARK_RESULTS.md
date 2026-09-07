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
