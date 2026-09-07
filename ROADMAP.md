# Roadmap

## Aplicación de facturas

### A0 — Especificación y núcleo

- [x] Versionar PRD y decisiones pendientes DP-01 a DP-15.
- [x] Implementar modelo, validación, nomenclatura y duplicados.
- [x] Implementar estados, excepciones, idempotencia y aislamiento por adjunto.
- [x] Preparar configuración M365, cliente Graph y adaptador SharePoint.

### A1 — Provisionamiento e integración

- [ ] Recibir accesos, licencias y parámetros del cliente.
- [ ] Crear recursos de Microsoft 365 y Azure para desarrollo.
- [ ] Empaquetar y desplegar el backend en Azure Functions.
- [ ] Crear el flujo Power Automate con Outlook, AI Builder y Excel.
- [ ] Configurar permisos de mínimo privilegio y monitorización.

### A2 — Piloto y aceptación

- [ ] Preparar documentos representativos anonimizados o autorizados.
- [ ] Ejecutar CA-01 a CA-12 y conservar evidencia.
- [ ] Medir exactitud, intervención, tiempos, excepciones y consumo.
- [ ] Corregir resultados y obtener aceptación del cliente.

## Orquestación local experimental

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
