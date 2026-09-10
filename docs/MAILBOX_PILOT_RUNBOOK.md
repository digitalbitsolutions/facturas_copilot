# Piloto del buzón de facturas

## Resultado validado

El 10 de septiembre de 2026 se validó este recorrido real en desarrollo:

```text
facturas-pruebas@integramente.onmicrosoft.com / Inbox
  → pollInvoiceMailbox (Azure Functions Flex Consumption)
  → Microsoft Graph con identidad administrada
  → https://integramente.sharepoint.com/sites/facturas
  → Documentos/Facturas
```

El archivo apareció con prefijo técnico `mail_` y `Modified By: SharePoint App`, evidencia de que fue creado por la integración.

## Recursos

| Recurso | Valor |
|---|---|
| Function App | `func-facturas-copilot-dev-jbhyjbgfzr3iy` |
| Grupo de recursos | `rg-facturas-copilot-dev` |
| Región | Spain Central |
| Buzón | `facturas-pruebas@integramente.onmicrosoft.com` |
| Carpeta vigilada | `Inbox` |
| Sitio | `https://integramente.sharepoint.com/sites/facturas` |
| Destino | Biblioteca `Documentos`, carpeta `Facturas` |
| Commit validado | `09e14bf` |
| Programación | `30 */10 * * * *` |

La programación significa segundo 30 de cada minuto múltiplo de diez. Los registros se muestran en UTC; se debe aplicar el desfase vigente de la zona local.

## Ajustes obligatorios

```text
M365_MAILBOX_ADDRESS=facturas-pruebas@integramente.onmicrosoft.com
M365_SHAREPOINT_SITE_ID=integramente.sharepoint.com,22c53ae6-a4db-491e-85b0-e976c559c890,c7b7b19b-73af-42e3-8b2b-67f7036ded5b
M365_SHAREPOINT_DRIVE_ID=<id de la biblioteca que comienza por b!>
M365_INVOICE_FOLDER=Facturas
INVOICE_MAIL_POLL_SCHEDULE=30 */10 * * * *
```

El Drive ID no es el Site ID. Para obtenerlos en Graph Explorer, iniciar sesión en el tenant y ejecutar:

```http
GET https://graph.microsoft.com/v1.0/sites/integramente.sharepoint.com:/sites/facturas?$select=id
```

Después:

```http
GET https://graph.microsoft.com/v1.0/sites/{SITE_ID}/drive?$select=id
```

Si la segunda consulta devuelve 403, conceder en **Modify Permissions** el permiso delegado mínimo indicado por Graph Explorer (`Files.Read` o `Files.Read.All` según la sesión) y, si continúa siendo necesario, `Sites.Read.All`. Estos consentimientos solo permiten la consulta interactiva; no conceden acceso a la identidad administrada de la Function.

## Despliegue correcto

El workflow `Deploy Azure Function` se inicia con **Run workflow**, rama `main`, entorno `dev` y región `spaincentral`. **Re-run jobs** repite el commit de una ejecución antigua y no publica cambios nuevos. Se debe comprobar el SHA mostrado por la ejecución.

Incidencia histórica resuelta: inicialmente `infra/main.bicep` declaraba una lista cerrada de `appSettings` sin los tres identificadores operativos, por lo que cada redespliegue eliminaba los valores añadidos manualmente. Ahora son parámetros Bicep y el despliegue debe restaurarlos. Después de cada despliegue se debe verificar una vez:

1. Abrir Function App → Settings → Environment variables.
2. Confirmar los tres ajustes obligatorios y sus valores, usando **Show value**.
3. Si falta alguno, tratar el despliegue como fallido y revisar sus parámetros; no mantener una corrección manual permanente.
4. No es imprescindible pulsar **Restart** en Flex Consumption: aplicar ajustes recicla la aplicación y el portal puede deshabilitar el botón.

## Diagnóstico en Log Analytics

Ruta: Function App → Monitoring → Logs. Consulta:

```kusto
union traces, exceptions
| where timestamp > ago(1h)
| where message contains "Invoice mailbox"
   or operation_Name contains "pollInvoiceMailbox"
| order by timestamp desc
| project timestamp, severityLevel, operation_Name, message,
          exceptionType = type,
          exceptionMessage = outerMessage
```

Expandir la fila más reciente cuyo mensaje comience por `Invoice mailbox polling failed`. Errores observados:

| Error | Causa | Resolución |
|---|---|---|
| `Missing app setting M365_...` | Bicep eliminó o nunca creó un ajuste obligatorio | Restaurar las variables y aplicar cambios |
| HTTP 400: `Could not find a property named 'contentBytes' on type 'microsoft.graph.attachment'` | `$select=contentBytes` se aplicaba al tipo base de adjunto | Corregido en `09e14bf`: listar adjuntos sin ese `$select` |
| HTTP 404 `ErrorInvalidUser` | El Site ID se pegó como `M365_MAILBOX_ADDRESS` | Restaurar la dirección SMTP del buzón |
| HTTP 403 | Falta autorización del buzón o del sitio para la identidad vigente | Verificar Exchange Application RBAC y `Sites.Selected` sobre el principal actual |
| HTTP 404 al escribir | Site ID, Drive ID o ruta incorrectos | Volver a resolver IDs mediante Graph y comprobar `Facturas` |

## Validación de nombres e idempotencia

La primera implementación construía el nombre concatenando IDs Graph saneados y truncados. Los IDs de Exchange compartían prefijos largos, por lo que el truncado podía generar la misma ruta para adjuntos diferentes. Además, `PUT` sobre la ruta estable sobrescribía el archivo en cada ciclo: no aumentaba el número de filas, pero sí cambiaba `Modified`.

El commit `79021de` aplica dos correcciones:

1. Genera una clave de 20 caracteres hexadecimales a partir de SHA-256 sobre el par `messageId`/`attachmentId`.
2. Consulta primero la ruta de SharePoint; solo ejecuta `PUT` cuando Graph devuelve 404 para ese archivo.

Prueba real posterior:

- Se retiraron 4 artefactos con nombres antiguos.
- Sin enviar nuevos mensajes, el siguiente ciclo reconstruyó 7 PDF distintos que seguían entre los 25 mensajes más recientes de `Inbox`.
- Los nombres quedaron en el formato `mail_<hash>_<nombre-original>.pdf`.
- `factura_2023_13_manuel_gonzalez.pdf` y `factura_2023_14_manuel_gonzalez.pdf`, adjuntos del mismo correo CA-03, aparecieron de forma independiente.
- Después de varios ciclos y aproximadamente una hora, seguían siendo 7 y las fechas de modificación no se actualizaron.

Conclusión: CA-03 y CA-07 quedan validados para la fase de archivado del piloto.

## Cierre de la deuda de despliegue

La validación final se realizó con `9d5aed8` y `8a7a225`. El workflow terminó sin annotations deprecadas ni advertencias de configuración de Storage. Después del redespliegue:

- Los tres ajustes M365 continuaron presentes por haber sido aplicados desde Bicep.
- Los 7 PDF continuaron en SharePoint.
- Sus fechas de modificación permanecieron estables.
- No fue necesaria ninguna reparación manual posterior.

## Criterio de éxito

La prueba se considera correcta cuando:

1. El correo permanece visible en `Inbox` con un PDF no inline.
2. `pollInvoiceMailbox` termina sin excepción.
3. El log `Invoice mailbox polling completed` informa al menos un adjunto archivado.
4. El PDF aparece en `Documentos/Facturas` con autor `SharePoint App`.
5. Un ciclo posterior no crea una copia adicional del mismo mensaje/adjunto.

El poller es de solo lectura y no mueve ni marca el correo. Examina hasta los 25 mensajes más recientes con adjuntos; `putOnce` evita duplicar el mismo par mensaje/adjunto.
