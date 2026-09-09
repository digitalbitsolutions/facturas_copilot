# Trabajo inmediato

## Integración Microsoft 365 — en espera del cliente

- [x] Recibir y verificar Tenant ID, dominio y cuenta de desarrollo/servicio.
- [ ] Activar la suscripción Azure (alta Free Trial iniciada; falta tarjeta autorizada por gerencia), confirmar región y permisos.
- [ ] Confirmar licencias/capacidades de Power Automate y AI Builder/Copilot Credits. Copilot y Business Premium ya están asignadas a `demo`.
- [ ] Recibir o crear buzón y carpeta de entrada.
- [x] Crear sitio SharePoint privado, carpetas y libro/tablas de simulación.
- [x] Crear listas de excepciones y parámetros de conciliación.
- [ ] Confirmar libro, tabla, propietarios y política de edición.
- [ ] Confirmar DP-01 a DP-15 del PRD.
- [ ] Confirmar DP-16 a DP-24 sobre extractos y conciliación.
- [x] Completar `.env` local con identificadores no secretos y comprobar la conectividad M365 durante el aprovisionamiento.
- [x] Empaquetar el núcleo como Azure Functions Runtime 4 / Node.js 24.
- [x] Implementar importación bancaria y motor determinista de conciliación.
- [x] Preparar Bicep, endpoints HTTP y GitHub Actions.
- [ ] Configurar Entra ID, identidad administrada, `Sites.Selected` y GitHub OIDC.
- [ ] Crear los flujos Power Automate y ejecutar pruebas de aceptación CA-01 a CA-21.

## Núcleo de facturas

- [x] Validar campos, fechas, importes, moneda y confianza.
- [x] Validar coherencia de base, IVA y total.
- [x] Generar nombre PDF seguro y clave de duplicidad.
- [x] Implementar estados, excepciones e idempotencia por adjunto.
- [x] Preparar cliente Graph y adaptador SharePoint simulado.
- [x] Versionar esquema Excel y configuración M365.

## Orquestación local experimental

### P0 — Antes de escribir el orquestador

- [ ] Reiniciar o cerrar aplicaciones hasta disponer de al menos 3 GB de RAM libre.
- [x] Medir tokens/segundo de cada modelo con contexto 2K y salida corta.
- [x] Elegir stack del adaptador: Node.js/TypeScript sin dependencias externas.
- [x] Confirmar gestor de paquetes y versión de Node.js: Node 24.14.0 y npm 11.9.0.
- [x] Definir qué datos del proyecto pueden procesarse localmente y cuáles no deben registrarse.

### P1 — Primera implementación

- [x] Crear `src/local-ai/ollama-client`.
- [x] Crear `src/local-ai/router` basado en reglas.
- [x] Crear esquemas para clasificación, resumen y propuesta de test.
- [x] Implementar límites: contexto, salida, timeout y concurrencia 1.
- [x] Implementar redacción de secretos.
- [x] Implementar telemetría JSONL.
- [x] Añadir pruebas unitarias con respuestas Ollama simuladas.

### P2 — Primer experimento

- [ ] Preparar 10 tareas de clasificación.
- [ ] Preparar 10 tareas pequeñas de código.
- [ ] Ejecutar control con Codex.
- [ ] Ejecutar variante local.
- [ ] Comparar tokens, latencia, aceptación y retrabajo.
- [ ] Decidir qué rutas se habilitan por defecto.

### No hacer todavía

- No descargar modelos de 7B o más.
- No ejecutar dos modelos simultáneamente.
- No dar acceso de red a Ollama.
- No permitir ejecución automática de comandos generados por un modelo.
- No integrar la ruta local en trabajo crítico sin línea base.
