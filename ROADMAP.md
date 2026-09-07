# Roadmap

## Fase 0 — Auditoría y diseño

- [x] Inventariar runtime, modelos y hardware.
- [x] Confirmar API local de Ollama.
- [x] Definir roles, límites y escalado inicial.
- [ ] Liberar memoria base y medir rendimiento estable.

## Fase 1 — Línea base

- [ ] Seleccionar tareas representativas del proyecto.
- [ ] Medir consumo cloud sin orquestación.
- [ ] Definir esquemas de salida y criterios de aceptación.
- [ ] Registrar latencia y calidad por categoría.

## Fase 2 — MVP del orquestador

- [ ] Implementar cliente Ollama con timeout y cancelación.
- [ ] Implementar router determinista.
- [ ] Implementar registro de prompts versionados.
- [ ] Validar salidas estructuradas.
- [ ] Añadir telemetría JSONL sin contenido sensible.
- [ ] Incorporar circuit breaker y escalado a Codex.

## Fase 3 — Evaluación

- [ ] Ejecutar batería control/local.
- [ ] Comparar Qwen/Gemma/Ministral donde se solapen.
- [ ] Calcular ahorro neto y retrabajo.
- [ ] Retirar rutas que no alcancen umbrales.

## Fase 4 — Integración con desarrollo

- [ ] Integrar búsqueda y selección de contexto.
- [ ] Integrar lint, typecheck y tests.
- [ ] Añadir comandos de desarrollador y documentación.
- [ ] Probar sobre historias pequeñas del proyecto de facturas.

## Fase 5 — Producción interna

- [ ] Establecer política de privacidad y retención.
- [ ] Crear panel o informe periódico de ahorro.
- [ ] Versionar configuración y prompts.
- [ ] Revisar modelos trimestralmente con el mismo benchmark.

