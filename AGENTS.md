# Orquestación por sesión

Al iniciar una sesión, leer `README.md`, `CONTEXT.md`, el área relevante de `TODO.md`, `git status --short` y los commits recientes. Cargar solo los archivos necesarios para la tarea.

Ejecutar directamente el trabajo determinista. Usar un único modelo Ollama solo para tareas pequeñas, no sensibles y verificables, con contexto mínimo y salida JSON; validar siempre con herramientas deterministas. Escalar a Codex ante ambigüedad, información sensible, formato inválido o el primer fallo. Registrar de forma concisa la latencia, aceptación y retrabajo de cualquier ensayo local; desactivar rutas que no demuestren ahorro neto.

No usar Ollama para arquitectura, seguridad, despliegues, migraciones, integraciones M365/Azure ni cambios transversales. No ejecutar modelos locales en paralelo.
