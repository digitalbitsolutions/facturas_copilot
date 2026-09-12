# Roadmap

## Aplicación de facturas

### A0 — Especificación y núcleo

- [x] Consolidar el alcance ejecutado en el PRD vigente v4 y retirar versiones anteriores.
- [x] Implementar modelo, validación, nomenclatura y duplicados.
- [x] Implementar estados, excepciones, idempotencia y aislamiento por adjunto.
- [x] Preparar configuración M365, cliente Graph y adaptador SharePoint.
- [x] Implementar importación bancaria, normalización y motor de conciliación explicable.
- [x] Empaquetar API HTTP como Azure Functions v4 y preparar infraestructura/CI.

### A1 — Provisionamiento e integración

- [x] Recibir y validar tenant, administrador y licencias M365 de prueba; crear aplicación Entra y recursos SharePoint de simulación.
- [x] Activar una suscripción Azure Trial para desarrollo.
- [x] Desplegar infraestructura y backend en Azure Functions protegida con Entra.
- [x] Validar el acceso delegado autenticado a la API.
- [x] Restringir el acceso de la identidad administrada a SharePoint mediante `Sites.Selected`.
- [x] Validar el archivado real de adjuntos PDF desde Exchange Online hasta SharePoint.
- [x] Hacer persistentes en IaC los identificadores del buzón, sitio y biblioteca usados por los temporizadores.
- [x] Implementar los temporizadores de Azure Functions para buzón e importación bancaria.
- [ ] Definir la interfaz operativa de conciliación y revisión humana sobre SharePoint Lists.
- [ ] Configurar permisos de mínimo privilegio y monitorización.

### A2 — Piloto y aceptación

- [ ] Preparar documentos representativos anonimizados o autorizados.
- [ ] Ejecutar CA-01 a CA-21 y conservar evidencia.
- [ ] Medir exactitud, intervención, tiempos, excepciones, consumo y falsos positivos de conciliación.
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
