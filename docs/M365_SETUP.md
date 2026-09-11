# Preparación de Microsoft 365

> Estado al 10 de septiembre de 2026: sitio, carpetas, libro, tablas, listas, buzón y archivado real de PDF validados en el tenant de prueba. Véase `CONTEXT.md`.

## Arquitectura de integración elegida

- Power Automate recibe el correo, enumera adjuntos y llama a AI Builder con identidad administrada por sus conexiones.
- Microsoft Graph archiva los PDF en SharePoint con permisos limitados al sitio.
- El conector Excel Online (Business) de Power Automate gestiona las tablas operativas con identidad delegada.
- El núcleo TypeScript conserva validación, idempotencia, nomenclatura, importación y reglas de conciliación.

Las APIs de libro de Excel en Microsoft Graph no admiten permisos de aplicación. Por ello no se usará client credentials para escribir el registro Excel.

## Alternativa sin Power Automate Premium

La Function App usa su identidad administrada con `Sites.Selected` para consultar `ExtractosBancarios` cada 10 minutos. Lee la primera hoja de un archivo `.xlsx`, `.xls` o `.csv`, guarda el lote y los movimientos en SharePoint Lists y mueve el archivo a `Procesados` o `Errores`. Esto elimina el conector HTTP Premium y no requiere una licencia por usuario de Power Automate.

Ejecutar una sola vez, autenticándose como propietario del sitio:

```powershell
.\scripts\provision-sharepoint-folders.ps1 -TenantId '<tenant-id>'
.\scripts\provision-sharepoint-lists.ps1 -TenantId '<tenant-id>'
```

El script crea también `MaestroProveedores`, `ProcesosFacturas` y `RegistroFacturas`. Antes de probar la aceptación automática, añade una fila por proveedor con `CodigoProveedor`, `RazonSocial`, `NIF`, `Aliases` (uno por línea o separados por `;`) y `Activo = Sí`. El NIF debe ser único entre proveedores activos. Si Document Intelligence entrega NIF, la Function exige una coincidencia exacta; solo cuando el NIF no está disponible compara la razón social y los alias normalizados. Una ausencia, contradicción o coincidencia múltiple obliga a revisión.

`ProcesosFacturas.ProcessId`, `RegistroFacturas.ProcessId` y `RegistroFacturas.DuplicateKey` son únicos. El estado sobrevive a reinicios y permite que un ciclo posterior reconozca un adjunto terminal sin repetir clasificación, extracción ni archivo. El despliegue mantiene `INVOICE_PROCESSING_ENABLED=false` e `INVOICE_PROCESSING_NOT_BEFORE=9999-12-31T23:59:59Z` por defecto; las listas deben existir y la fecha de corte debe fijarse antes de activarlo.

Los ajustes operativos `M365_MAILBOX_ADDRESS`, `M365_SHAREPOINT_SITE_ID` y `M365_SHAREPOINT_DRIVE_ID` están declarados como parámetros en Bicep. El despliegue los aplica junto con los nombres de carpetas, listas y horarios; para otro tenant se deben sobrescribir los parámetros sin modificar el código.

## Acceso al buzón de pruebas

El buzón de pruebas es `facturas-pruebas@integramente.onmicrosoft.com`. Su acceso se concede únicamente con Exchange Application RBAC, usando `scripts/grant-function-mailbox-rbac.ps1` y los identificadores de identidad administrada de la Function. No se debe conservar `Mail.Read` como permiso de aplicación asignado directamente en Entra, porque sería global y anularía el alcance por buzón.

## Recursos que se crearán

```text
Sitio privado: /sites/facturas
Biblioteca: Documentos
Carpeta PDF: Facturas
Carpeta bancaria restringida: ExtractosBancarios
Carpeta configuración: Configuracion
Libro: Configuracion/RegistroFacturas.xlsx
Hoja: Facturas
Tabla: tblFacturas
Tablas adicionales: tblLotesBancarios, tblMovimientos, tblConciliaciones
```

Los esquemas versionados están en `deployment/excel-schema.json`, `deployment/bank-register-schema.json` y `deployment/bank-import-schema.json`.

## Parámetros pendientes del tenant

Copiar `.env.example` como `.env` y completar solo identificadores y nombres. `.env` no se versiona.

| Variable | Cómo se obtiene |
|---|---|
| `M365_TENANT_ID` | Centro de administración de Microsoft Entra, información general |
| `M365_CLIENT_ID` | Registro de aplicación creado para el proyecto |
| `M365_SHAREPOINT_SITE_URL` | URL de la portada del sitio privado |
| `M365_SHAREPOINT_SITE_ID` | Graph Explorer: `GET /sites/integramente.sharepoint.com:/sites/facturas?$select=id` |
| `M365_SHAREPOINT_DRIVE_ID` | Se resolverá por Graph al conectar el sitio |
| `M365_INVOICE_FOLDER` | Carpeta de PDF, inicialmente `Facturas` |
| `M365_BANK_FOLDER` | Carpeta restringida de extractos, inicialmente `ExtractosBancarios` |
| `M365_MAILBOX_ADDRESS` | Buzón que recibe facturas |
| `M365_MAIL_FOLDER` | Carpeta vigilada, inicialmente `Inbox` |
| `M365_EXCEL_FILE_PATH` | `Configuracion/RegistroFacturas.xlsx` |
| `M365_EXCEL_TABLE` | `tblFacturas` |
| `M365_BANK_BATCH_TABLE` | `tblLotesBancarios` |
| `M365_BANK_MOVEMENT_TABLE` | `tblMovimientos` |
| `M365_RECONCILIATION_TABLE` | `tblConciliaciones` |
| `M365_AI_BUILDER_MODEL_ID` | Identificador del modelo publicado |

## Credenciales

No se guardan secretos en el repositorio ni en `.env`. Para Graph se elegirá certificado o secreto almacenado en un almacén seguro. Para Outlook, Excel y AI Builder se utilizarán conexiones administradas de Power Automate.

Permiso configurado para Graph: `Sites.Selected` con escritura concedida únicamente al sitio de facturas a la identidad administrada de la Function App. La concesión debe revisarse de nuevo antes de producción.

## Comprobaciones al disponer de la cuenta

1. Confirmar acceso al centro de administración y a Power Platform.
2. Crear el sitio privado y asignar propietarios.
3. Crear carpetas y libro estructurado.
4. Registrar la aplicación y conceder mínimo privilegio.
5. Publicar o seleccionar el modelo de procesamiento de facturas.
6. Crear conexiones Power Automate con una cuenta de servicio o propietario definido.
7. Crear la carpeta bancaria restringida y las tablas de lotes, movimientos y conciliaciones.
8. Ejecutar una prueba con facturas y extractos anonimizados.

## Piloto validado y resolución de problemas

El procedimiento completo, consultas de Graph Explorer, consulta KQL, errores observados y recuperación tras despliegue están en [MAILBOX_PILOT_RUNBOOK.md](./MAILBOX_PILOT_RUNBOOK.md).
