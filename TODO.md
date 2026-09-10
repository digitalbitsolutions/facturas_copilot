# Trabajo inmediato

## Integración Microsoft 365 — en espera del cliente

- [x] Recibir y verificar Tenant ID, dominio y cuenta de desarrollo/servicio.
- [x] Activar la suscripción Azure Trial: `e7e239ec-59fb-4128-b9e1-b7854f426f4d`.
- [x] Confirmar Spain Central, permisos Azure y desplegar infraestructura de desarrollo en `rg-facturas-copilot-dev`.
- [ ] Obtener o asignar Power Automate Premium a la cuenta propietaria del flujo y confirmar AI Builder/Copilot Credits. Copilot y Business Premium ya están asignadas a `demo`; el conector HTTP con Entra confirma que Premium falta.
- [x] Crear y validar el buzón `facturas-pruebas@integramente.onmicrosoft.com` y su carpeta `Inbox`.
- [x] Crear sitio SharePoint privado, carpetas y libro/tablas de simulación.
- [x] Crear listas de excepciones y parámetros de conciliación.
- [ ] Confirmar libro, tabla, propietarios y política de edición.
- [ ] Confirmar DP-01 a DP-15 del PRD.
- [ ] Confirmar DP-16 a DP-24 sobre extractos y conciliación.
- [x] Completar `.env` local con identificadores no secretos y comprobar la conectividad M365 durante el aprovisionamiento.
- [x] Empaquetar el núcleo como Azure Functions Runtime 4 / Node.js 24.
- [x] Implementar importación bancaria y motor determinista de conciliación.
- [x] Preparar Bicep, endpoints HTTP y GitHub Actions.
- [x] Conceder consentimiento delegado de Entra a Azure CLI y probar `/api/health` autenticado (HTTP 200).
- [x] Conceder `Sites.Selected` y `write` de SharePoint a la identidad administrada, restringidos a `/sites/facturas`.
- [x] Registrar los valores OIDC en GitHub Actions y validar el workflow de despliegue.
- [x] Corregir la descarga de adjuntos Graph sin `$select=contentBytes` sobre el tipo base `attachment`.
- [x] Validar el circuito real Outlook → Azure Function → Graph → SharePoint con un PDF.
- [x] Validar un correo con dos PDF diferentes; ambos quedaron archivados como elementos independientes (CA-03).
- [x] Eliminar colisiones de nombres usando una clave hash corta del mensaje y adjunto.
- [x] Evitar sobrescrituras en ciclos posteriores y validar fechas de modificación estables (CA-07).
- [x] Declarar `M365_MAILBOX_ADDRESS`, `M365_SHAREPOINT_SITE_ID` y `M365_SHAREPOINT_DRIVE_ID` como parámetros Bicep para que cada despliegue los restaure.
- [x] Redesplegar y confirmar que variables y documentos persisten sin intervención manual.
- [x] Actualizar GitHub Actions a runtimes Node 24 y eliminar warnings de Azure Login y Storage.
- [x] Implementar extracción controlada con Document Intelligence `prebuilt-invoice`, páginas 1-2 y nivel F0.
- [x] Registrar una vez `Microsoft.CognitiveServices` en la suscripción con un administrador; OIDC está limitado al grupo de recursos.
- [x] Hacer configurable la región de Document Intelligence porque `spaincentral` no ofrece `FormRecognizer` y `westeurope` no acepta nuevos clientes de esta suscripción.
- [x] Asignar a la Function `Cognitive Services Data Contributor (Preview)` porque el rol User del tenant no contiene `documentmodels:analyze/action`.
- [x] Desplegar F0 y evaluar visualmente cuatro documentos reales en Document Intelligence Studio fuera de Git.
- [x] Registrar conclusiones anonimizadas de precisión sin conservar datos personales o fiscales en el repositorio.
- [x] Redesplegar el mapeo refinado y probar `/api/invoices/extract` de extremo a extremo.
- [ ] Definir umbrales por campo y reglas de aceptación apoyadas en coherencia fiscal y maestro de proveedores; no reducir el umbral global.
- [ ] Implementar clasificación previa para separar facturas de liquidaciones y otros documentos.
- [x] Ajustar el mapeo real: razón social completa y base derivada con confianza conservadora cuando falta `SubTotal`.
- [ ] Confirmar en Application Insights una ejecución exitosa y conservar la evidencia del contador `archived`.
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
