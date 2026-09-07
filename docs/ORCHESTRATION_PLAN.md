# Plan de orquestación

## 1. Objetivo

Reducir el contexto y la generación enviados a Codex delegando tareas pequeñas, repetibles y verificables a Ollama. Codex seguirá siendo el coordinador y resolverá las tareas que exijan visión global, edición sensible o criterio arquitectónico.

## 2. Componentes previstos

| Componente | Responsabilidad |
|---|---|
| Context selector | Seleccionar solo archivos y fragmentos relevantes mediante búsqueda determinista |
| Policy router | Decidir local, Codex o herramienta determinista |
| Ollama adapter | Llamar a `/api/chat`, aplicar límites y validar respuestas |
| Prompt registry | Versionar prompts por tipo de tarea |
| Output validator | Validar JSON, esquema, diff, lint o tests |
| Escalation controller | Escalar una vez a Codex con evidencia condensada |
| Telemetry store | Registrar métricas sin contenido sensible |

## 3. Contrato del adaptador local

Entrada mínima:

```json
{
  "task_id": "uuid",
  "task_type": "classify|extract|summarize|code_patch|test_generation|vision",
  "model": "qwen3:1.7b",
  "instructions": "instrucción acotada",
  "context": ["fragmentos seleccionados"],
  "output_schema": {},
  "limits": {"num_ctx": 2048, "num_predict": 256, "timeout_s": 90}
}
```

Salida mínima:

```json
{
  "status": "accepted|invalid|timeout|escalate",
  "result": {},
  "metrics": {
    "prompt_tokens": 0,
    "completion_tokens": 0,
    "latency_ms": 0,
    "model": "",
    "prompt_version": ""
  }
}
```

## 4. Matriz de decisión

### Local permitido

- entrada menor de 3.000 tokens;
- resultado comprobable automáticamente;
- cambio limitado inicialmente a un archivo y menos de 80 líneas;
- sin secretos, credenciales ni datos personales innecesarios;
- sin decisiones de arquitectura o producto;
- impacto reversible y bajo.

### Codex obligatorio

- autenticación, autorización, seguridad o privacidad;
- migraciones de datos o cambios destructivos;
- infraestructura y producción;
- cambios en varios subsistemas;
- requisitos ambiguos o contradictorios;
- depuración que ya falló una vez localmente;
- revisión final antes de aceptar trabajo sensible.

### Herramienta determinista antes que LLM

- búsqueda de texto o símbolos;
- formato y lint;
- compilación y tests;
- comparación de esquemas;
- recuento, filtrado o transformación mecánica.

## 5. Asignación de modelos

### Qwen 3 1.7B — router

- clasificación de intención y riesgo;
- selección entre categorías predefinidas;
- extracción estructurada;
- normalización de errores;
- generación JSON con esquema pequeño.

Usar `/no_think` cuando no sea necesario razonar para reducir latencia y salida.

### Qwen 2.5 Coder 3B — worker de código

- tests unitarios sencillos;
- explicación de errores acotados;
- documentación de funciones;
- parches pequeños con archivos explícitos;
- revisión local de convenciones.

No debe diseñar arquitectura ni aplicar cambios sin validación posterior.

### Gemma 3 4B / Ministral 3B — visión

- descripción estructurada de capturas;
- detección visual de problemas de layout;
- extracción de elementos visibles.

Solo uno quedará como modelo visual habitual después de la evaluación A/B.

### DeepSeek R1 1.5B — candidato experimental

Solo para hipótesis pequeñas. Su modo de razonamiento puede consumir tiempo y salida, por lo que no forma parte de la ruta crítica hasta demostrar ahorro neto.

## 6. Límites operativos

- `num_ctx`: 2.048 por defecto; 4.096 máximo ordinario.
- `num_predict`: 128 para clasificación, 256 para extracción/resumen y 512 para código.
- `temperature`: 0–0,2 para JSON/código; configuración específica para tareas creativas.
- `keep_alive`: `0` durante evaluación; después, máximo breve para lotes consecutivos.
- concurrencia local: 1.
- reintentos: 0 por defecto; un fallo escala en lugar de repetir prompts a ciegas.
- timeout inicial: 90 segundos, sujeto a benchmark.

Los límites se pasan en cada llamada; no se confía en el contexto máximo anunciado por el modelo.

## 7. Reducción de contexto cloud

1. Buscar símbolos y archivos con herramientas deterministas.
2. Recortar fragmentos con líneas de contexto controladas.
3. Pedir al modelo local una salida con esquema.
4. Validar la salida.
5. Enviar a Codex únicamente objetivo, fragmentos relevantes, resultado validado y errores de herramientas.

No se usarán resúmenes locales como única evidencia para decisiones sensibles: deberán incluir referencias a archivo y línea.

## 8. Seguridad

- Ollama permanecerá enlazado a `127.0.0.1` salvo decisión explícita.
- No se registrarán prompts completos por defecto.
- Los logs guardarán hashes, tamaños, modelo, métricas y estado.
- Se redactarán secretos antes de cualquier llamada.
- Ninguna salida local podrá ejecutar comandos directamente.
- Las escrituras pasarán por la misma revisión, diff y pruebas que el trabajo manual.

## 9. Criterio de adopción

Una categoría se incorpora al flujo normal cuando supere un mínimo de 30 tareas representativas y consiga:

- al menos 70 % de aceptación sin retrabajo;
- cero defectos críticos atribuibles a la delegación;
- reducción mediana de al menos 30 % de tokens cloud;
- latencia compatible con el flujo de desarrollo.

Los umbrales son hipótesis iniciales y se revisarán con datos.

