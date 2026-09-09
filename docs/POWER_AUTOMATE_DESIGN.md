# Diseño de flujos Power Automate
Este documento permite construir los flujos cuando exista acceso al tenant. Las conexiones, identificadores de recursos y referencias de solución se enlazarán entonces; no se almacenarán contraseñas.

## Flujo 1 — Recepción de facturas

1. Disparador de Outlook sobre el buzón y carpeta configurados.
2. Registrar `MessageId`, remitente, asunto, recepción y `FlowRunId`.
3. Enumerar adjuntos y ejecutar un ámbito independiente por adjunto.
4. Rechazar tipos o tamaños no admitidos.
5. Clasificar documento.
6. Para facturas, invocar AI Builder y mapear campos y confianza.
7. Llamar a `POST /api/invoices/validate` usando autenticación Entra.
8. Si requiere revisión, crear/actualizar la excepción sin perder el original.
9. Comprobar idempotencia y duplicidad, guardar PDF y registrar metadatos.
10. Notificar las excepciones según la política acordada.

## Flujo 2 — Importación de extractos

1. Disparador al crear un Excel en la carpeta bancaria restringida.
2. Conservar el original y obtener metadatos/hash estable.
3. Leer filas de la tabla Excel con Excel Online (Business).
4. Seleccionar el mapeo correspondiente al banco y versión del esquema.
5. Recuperar huellas existentes y llamar a `POST /api/bank/import`.
6. Si se rechaza, registrar `EX-11`/`EX-13`, adjuntar incidencias y detener ese lote.
7. Si se acepta, crear el lote y sus movimientos mediante operaciones idempotentes.
8. Invocar el flujo de conciliación con los movimientos nuevos.

## Flujo 3 — Conciliación

1. Consultar facturas pendientes elegibles y movimientos no conciliados.
2. Llamar a `POST /api/bank/reconcile` con la configuración vigente.
3. Persistir candidatos, puntuación, factores y clasificación.
4. `Alta`: mantener propuesta; aceptar automáticamente solo si `automaticAcceptanceEnabled` fue aprobado.
5. `Probable`/`Revisar`: crear elemento en la cola de revisión.
6. `Sin coincidencia`: conservar para revisión o siguiente ejecución.
7. Al aceptar, registrar vínculo, importe aplicado, fecha, referencia, usuario/origen y estado.
8. Al rechazar, conservar auditoría y permitir evaluar otros candidatos.

## Flujo 4 — Revisión humana

La interfaz definitiva puede ser una lista SharePoint o una Power App. Debe mostrar factura/PDF, movimiento original, candidatos, puntuación y motivos, y permitir confirmar, rechazar o dejar pendiente. Nunca debe exigir editar manualmente un flujo o una fila técnica.

## Conexiones pendientes

- Outlook / buzón de facturas.
- SharePoint / sitio, bibliotecas y listas.
- Excel Online (Business) / libro y tablas.
- AI Builder / modelo de procesamiento de facturas.
- HTTP con Microsoft Entra ID / Azure Function.
- Canal de notificaciones.
# Conexiones y seguridad

Las llamadas a la Azure Function usan **HTTP With Microsoft Entra ID**, con recurso `api://66e78b9f-fbbe-4e80-beda-83469b6fee8c`. El cliente oficial del conector está preautorizado únicamente para el scope `access_as_user`; no se introducen secretos de Azure en Power Automate.
