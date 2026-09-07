# Política de datos para IA local

## Alcance

Esta política cubre la selección de contexto, el envío a Ollama y la telemetría del orquestador local. Ollama debe permanecer accesible únicamente en `127.0.0.1`.

## Datos permitidos

- Código fuente y documentación interna necesarios para la tarea.
- Errores, trazas y configuraciones después de eliminar secretos y datos personales.
- Datos ficticios, anonimizados o agregados.
- Fragmentos mínimos obtenidos mediante búsqueda determinista.

## Datos que requieren minimización o anonimización

- Nombres, correos, teléfonos, direcciones e identificadores de clientes o empleados.
- Datos de facturas y proveedores que permitan identificar a una persona física.
- Rutas locales que contengan nombres personales.
- Logs con parámetros, cabeceras, cuerpos de petición o consultas completas.

Estos datos solo pueden procesarse cuando sean imprescindibles para la tarea y después de sustituir los valores identificativos por marcadores estables como `[PERSON_1]` o `[INVOICE_1]`.

## Datos prohibidos

- Contraseñas, tokens, claves API, cookies de sesión y secretos de cliente.
- Claves privadas, certificados con clave privada y frases de recuperación.
- Datos bancarios completos, números de tarjeta o credenciales de pago.
- Datos de salud, biométricos u otras categorías especialmente sensibles.
- Contenido procedente de producción cuando exista una alternativa anonimizada.

Si se detecta alguno de estos datos, la tarea no se envía al modelo. La redacción automática es una defensa adicional, no una autorización para procesarlos.

## Registro y retención

La telemetría solo puede guardar identificadores técnicos, categoría, ruta, modelo, versión del prompt, conteos de tokens, latencia, resultado de validación y marcas de escalado. No guarda prompts, respuestas, fragmentos de código, nombres de archivo completos ni datos del usuario.

Los registros JSONL se almacenan en `.local-ai/`, excluido del control de versiones. Retención inicial: 30 días; después se eliminan o se agregan de forma irreversible. El acceso queda limitado al equipo de desarrollo autorizado.

## Controles operativos

1. Seleccionar el mínimo contexto necesario.
2. Detectar y redactar secretos antes de construir la petición.
3. Anonimizar datos personales antes del envío.
4. Rechazar la tarea si la limpieza no puede verificarse.
5. No ejecutar comandos ni aplicar cambios producidos por el modelo sin validación determinista.
6. Escalar a Codex los casos de privacidad, seguridad o clasificación dudosa sin incluir el dato sensible.

## Responsabilidad

Quien prepara la tarea confirma que el contexto cumple esta política. Cualquier incidente suspende la ruta local afectada hasta revisar causa, alcance y controles.
