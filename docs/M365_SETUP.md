# Preparación de Microsoft 365

> Estado al 8 de septiembre de 2026: preparación local terminada; provisionamiento detenido hasta recibir accesos y parámetros del cliente. Véase `CONTEXT.md`.

## Arquitectura de integración elegida

- Power Automate recibe el correo, enumera adjuntos y llama a AI Builder con identidad administrada por sus conexiones.
- Microsoft Graph archiva los PDF en SharePoint con permisos limitados al sitio.
- El conector Excel Online (Business) de Power Automate escribe en `tblFacturas` con identidad delegada.
- El núcleo TypeScript conserva validación, idempotencia, nomenclatura y reglas de excepción.

Las APIs de libro de Excel en Microsoft Graph no admiten permisos de aplicación. Por ello no se usará client credentials para escribir el registro Excel.

## Recursos que se crearán

```text
Sitio privado: /sites/facturas
Biblioteca: Documentos
Carpeta PDF: Facturas
Carpeta configuración: Configuracion
Libro: Configuracion/RegistroFacturas.xlsx
Hoja: Facturas
Tabla: tblFacturas
```

El esquema versionado del libro está en `deployment/excel-schema.json`.

## Parámetros pendientes del tenant

Copiar `.env.example` como `.env` y completar solo identificadores y nombres. `.env` no se versiona.

| Variable | Cómo se obtiene |
|---|---|
| `M365_TENANT_ID` | Centro de administración de Microsoft Entra, información general |
| `M365_CLIENT_ID` | Registro de aplicación creado para el proyecto |
| `M365_SHAREPOINT_SITE_URL` | URL de la portada del sitio privado |
| `M365_SHAREPOINT_DRIVE_ID` | Se resolverá por Graph al conectar el sitio |
| `M365_INVOICE_FOLDER` | Carpeta de PDF, inicialmente `Facturas` |
| `M365_MAILBOX_ADDRESS` | Buzón que recibe facturas |
| `M365_MAIL_FOLDER` | Carpeta vigilada, inicialmente `Inbox` |
| `M365_EXCEL_FILE_PATH` | `Configuracion/RegistroFacturas.xlsx` |
| `M365_EXCEL_TABLE` | `tblFacturas` |
| `M365_AI_BUILDER_MODEL_ID` | Identificador del modelo publicado |

## Credenciales

No se guardan secretos en el repositorio ni en `.env`. Para Graph se elegirá certificado o secreto almacenado en un almacén seguro. Para Outlook, Excel y AI Builder se utilizarán conexiones administradas de Power Automate.

Permiso previsto para Graph: `Sites.Selected` con escritura concedida únicamente al sitio de facturas. La concesión final debe validarse en el tenant antes de producción.

## Comprobaciones al disponer de la cuenta

1. Confirmar acceso al centro de administración y a Power Platform.
2. Crear el sitio privado y asignar propietarios.
3. Crear carpetas y libro estructurado.
4. Registrar la aplicación y conceder mínimo privilegio.
5. Publicar o seleccionar el modelo de procesamiento de facturas.
6. Crear conexiones Power Automate con una cuenta de servicio o propietario definido.
7. Ejecutar una prueba con documentos anonimizados.
