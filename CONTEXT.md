# Contexto de reanudación

Actualizado: 10 de septiembre de 2026, después de validar el archivado real de correo a SharePoint.

## Objetivo

Automatizar la recepción y gestión de facturas en Microsoft 365: correo, clasificación, extracción con AI Builder, validación, detección de duplicados, archivo en SharePoint, registro y consultas mediante Copilot. La fase 1 incluye la importación manual de extractos Excel y la conciliación bancaria por reglas, sin conexión directa con bancos ni ejecución de pagos.

## Estado actual

- Repositorio: `https://github.com/digitalbitsolutions/facturas_copilot`.
- Rama de trabajo: `main`.
- Runtime local: Node.js 24, TypeScript ejecutado en modo nativo para desarrollo.
- Núcleo de factura terminado: campos, fechas, importes, moneda, confianza, coherencia, nombres seguros y clave de duplicidad.
- Procesador terminado: estados, excepciones, idempotencia, reproceso y aislamiento por adjunto.
- Integración M365 validada en el tenant: la Function lee el buzón restringido mediante Graph y archiva adjuntos PDF en SharePoint.
- Importación bancaria y conciliación local terminadas: lotes, validación, normalización, duplicidad, puntuación explicable y ambigüedad.
- Azure Functions v4 preparada con endpoints HTTP; infraestructura Flex Consumption y CI/CD preparadas.
- Pruebas actuales: 36 superadas.
- Tenant de pruebas verificado: `INTEGRAMENTE SL`, dominio `integramente.onmicrosoft.com` (`a1a2b397-4ac5-4f94-9004-67f158ea14e0`).
- Administrador comunicado: `demo@integramente.onmicrosoft.com`; la contraseña no se almacena.
- Licencias verificadas el 9 de septiembre de 2026: 25 `O365_BUSINESS_PREMIUM` y 25 `MICROSOFT_365_COPILOT_FOR_BUSINESS`, ambas habilitadas y sin asignar.
- Licencias Business Premium y Copilot asignadas a `demo@integramente.onmicrosoft.com` el 9 de septiembre de 2026.
- Registro Entra creado: `facturas-copilot-api-dev` (Client ID `66e78b9f-fbbe-4e80-beda-83469b6fee8c`), sin secreto ni certificado.
- Instancia empresarial (service principal) de la API creada y permiso delegado `access_as_user` concedido a Azure CLI. La llamada autenticada a `/api/health` devolvió `200` y versión `3.0` el 9 de septiembre de 2026.
- Sitio privado creado: `https://integramente.sharepoint.com/sites/facturas`.
- Biblioteca predeterminada preparada con `Facturas`, `ExtractosBancarios` y `Configuracion`.
- Libro `Configuracion/RegistroFacturas.xlsx` inicializado con `tblFacturas`, `tblLotesBancarios`, `tblMovimientos` y `tblConciliaciones`.
- Listas SharePoint creadas: `Excepciones` y `ConfiguracionConciliacion`.
- Suscripción Azure Trial activa: `e7e239ec-59fb-4128-b9e1-b7854f426f4d`, con crédito promocional. Los recursos de desarrollo se facturarán, si aplica, contra ese crédito Trial.
- Infraestructura Azure desplegada el 9 de septiembre de 2026 en `rg-facturas-copilot-dev` (Spain Central): Function App `func-facturas-copilot-dev-jbhyjbgfzr3iy`, almacenamiento, Log Analytics, Application Insights, Key Vault e identidades/RBAC gestionados.
- URL de la API de desarrollo: `https://func-facturas-copilot-dev-jbhyjbgfzr3iy.azurewebsites.net`. Los cuatro endpoints están registrados y devuelven `401` sin token, como corresponde a la protección Entra.
- La identidad administrada vigente mostrada por la Function App es `5dd4df87-b31f-4b55-ad16-54eec2939986`. El archivado real confirma acceso efectivo al buzón restringido y escritura en el sitio de facturas. El identificador histórico `23530c7b-95c2-44bf-b949-36750c962917` ya no debe utilizarse sin volver a verificarlo en Azure.
- OIDC de GitHub preparado: aplicación `facturas-copilot-github-deploy-dev` (Client ID `7db41108-d13f-4c3e-920a-832e875e1caa`), restringida a `digitalbitsolutions/facturas_copilot` en la rama `main` y entorno `dev`. Tiene `Contributor` y `Role Based Access Control Administrator` solo en `rg-facturas-copilot-dev`, necesarios para aplicar la infraestructura y sus permisos RBAC. Falta ejecutar correctamente el workflow de GitHub Actions.
- GitHub Actions OIDC validado. El workflow usa acciones basadas en Node 24 y configura el almacenamiento del host mediante `AzureWebJobsStorage__accountName` y `AzureWebJobsStorage__credential=managedidentity`, sin cadena de conexión.
- La aplicación Entra de la API preautoriza el cliente `HTTP With Microsoft Entra ID` de Power Automate solo para el scope delegado `access_as_user`; esto permite a los flujos llamar a la API sin usar secretos.
- Para Power Automate, la API también expone el identificador HTTPS de la Function `https://func-facturas-copilot-dev-jbhyjbgfzr3iy.azurewebsites.net`, validado con HTTP 200. El conector exige que el recurso Entra y la URL de llamada compartan esa base.
- Power Automate está accesible en el entorno Default y las conexiones SharePoint/Excel Online (Business) funcionan. La acción `HTTP With Microsoft Entra ID` requiere Power Automate Premium; el comprobador del flujo confirma que `demo` no dispone de esa licencia. El flujo `Importar extracto bancario - Dev` queda guardado como borrador y no debe activarse hasta asignar la capacidad.
- El 10 de septiembre de 2026 se completó una prueba real: correo recibido en `facturas-pruebas@integramente.onmicrosoft.com`, PDF leído por `pollInvoiceMailbox` y archivo creado en `Documentos/Facturas` con `Modified By: SharePoint App`.
- El código validado y desplegado corresponde al commit `09e14bf` (`Fix invoice attachment retrieval`).
- La idempotencia estricta y los nombres cortos se corrigieron y desplegaron en `79021de` (`Make SharePoint archiving truly idempotent`). La validación real posterior reconstruyó 7 adjuntos históricos con claves hash distintas y mantuvo sus fechas sin cambios durante varios ciclos.
- La deuda de despliegue quedó cerrada el 10 de septiembre: `9d5aed8` persiste los tres ajustes M365 mediante Bicep y `8a7a225` actualiza las acciones a Node 24/Azure Login v3 y usa `AzureWebJobsStorage__accountName`. El redespliegue terminó sin warnings; las variables y los 7 documentos persistieron sin cambios.
- El 10 de septiembre se desplegó Document Intelligence F0 en `northeurope` y se evaluaron cuatro documentos reales fuera de Git: uno completo y coherente; uno con base derivable y confianza fiscal baja; uno sin desglose fiscal; y una liquidación bancaria que el modelo confundió con factura. Los hallazgos originaron mapeo de razón social, derivación conservadora de base y rechazo de base cero.
- La prueba extremo a extremo de `/api/invoices/extract` funcionó con autenticación Entra e identidad administrada. Una factura completa produjo importes correctos y coherentes, pero quedó en revisión porque proveedor, número, vencimiento y base no alcanzaron confianza `0,8`; no se reducirá el umbral global sin reglas adicionales.
- La política piloto usa umbrales por campo (`0,75` proveedor, `0,70` número, `0,85` fecha, `0,65` vencimiento, `0,40` base, `0,80` IVA, `0,90` total y `0,80` moneda), mantiene `0,8` como respaldo y nunca sustituye la validación determinista de formatos y coherencia fiscal.
- La identidad del proveedor se resuelve contra la lista `MaestroProveedores`: NIF exacto y único cuando está disponible, o razón social/alias normalizado si no lo está. Proveedores desconocidos, inactivos, contradictorios o ambiguos quedan en revisión antes de archivar.
- El 11 de septiembre se aprovisionó `MaestroProveedores` y se verificó el circuito desplegado con una factura autorizada: NIF extraído con confianza `0,829`, coincidencia `tax_id` con un proveedor activo y `validation.valid = true` sin incidencias.
- La clasificación previa lee las páginas 1-2 con `prebuilt-read` y decide mediante señales auditables entre `invoice`, `bank_settlement` y `other`. Solo las facturas continúan a `prebuilt-invoice`; evidencia insuficiente se detiene de forma conservadora.
- No existe aún ningún recurso productivo ni credencial almacenada.

## Evidencia y diagnóstico del piloto de correo

Flujo validado:

```text
Remitente externo
  → Exchange Online / Inbox de facturas-pruebas
  → temporizador pollInvoiceMailbox
  → Microsoft Graph con identidad administrada
  → biblioteca Documentos / carpeta Facturas
```

Cronología del 10 de septiembre de 2026:

1. Se confirmó la llegada de varios correos con PDF al buzón compartido.
2. SharePoint permaneció vacío y Log Analytics mostró primero `Missing app setting`.
3. Se añadieron manualmente `M365_SHAREPOINT_SITE_ID` y `M365_SHAREPOINT_DRIVE_ID`.
4. Graph devolvió HTTP 400 porque la consulta aplicaba `$select=contentBytes` al tipo base `microsoft.graph.attachment`. Se eliminó ese `$select` en `src/microsoft365/mail-poller.ts` y se añadió una prueba de regresión.
5. Se publicó el commit `09e14bf` y se lanzó una ejecución nueva de `Deploy Azure Function` sobre `main`; repetir una ejecución antigua no despliega el commit nuevo.
6. El despliegue Bicep sustituyó los ajustes manuales. Se volvieron a crear las tres variables operativas.
7. Graph devolvió HTTP 404 `ErrorInvalidUser` porque `M365_MAILBOX_ADDRESS` contenía accidentalmente el Site ID. Se corrigió al buzón SMTP.
8. En el siguiente ciclo el PDF apareció en SharePoint, modificado por `SharePoint App`.
9. Se detectó que la implementación inicial no creaba filas adicionales, pero ejecutaba `PUT` en cada ciclo y actualizaba `Modified`. Además, truncar los IDs largos producía colisiones entre adjuntos con prefijos comunes.
10. En `79021de` se sustituyó el identificador visible por un hash SHA-256 truncado y estable del par mensaje/adjunto, se añadió una consulta previa y se evitó el `PUT` cuando el elemento ya existe.
11. Tras eliminar los cuatro artefactos antiguos, el sistema reconstruyó 7 archivos reales: cuatro facturas de septiembre y las facturas 2023/12, 2023/13 y 2023/14. El resultado demostró que el esquema antiguo había ocultado adjuntos por colisión de nombres.
12. Después de aproximadamente una hora y varios ciclos, los 7 archivos conservaron la misma antigüedad de modificación. Quedó validada la idempotencia sin sobrescritura.

Configuración operativa no secreta:

| Ajuste | Valor/criterio |
|---|---|
| `M365_MAILBOX_ADDRESS` | `facturas-pruebas@integramente.onmicrosoft.com` |
| `M365_SHAREPOINT_SITE_ID` | `integramente.sharepoint.com,22c53ae6-a4db-491e-85b0-e976c559c890,c7b7b19b-73af-42e3-8b2b-67f7036ded5b` |
| `M365_SHAREPOINT_DRIVE_ID` | ID de la biblioteca predeterminada obtenido con Graph; empieza por `b!` |
| `M365_INVOICE_FOLDER` | `Facturas` |
| `INVOICE_MAIL_POLL_SCHEDULE` | `30 */10 * * * *` |

El temporizador se ejecuta cada diez minutos en el segundo 30. Application Insights presenta marcas UTC; durante esta prueba España estaba en UTC+2, por lo que `09:00:30 UTC` equivalía a `11:00:30` local.

## Arquitectura acordada

```text
Outlook → Power Automate → AI Builder
                         ↓
                 Azure Function TypeScript
                    ├─ reglas y validación
                    ├─ idempotencia
                    └─ Microsoft Graph → SharePoint
                         ↓
              Registro Microsoft 365 mediante Power Automate
                         ↓
                  Copilot / Copilot Studio

Extracto Excel → Power Automate → Azure Function (reglas de conciliación)
                                      ↓
                         revisión / vínculo confirmado
```

- Código fuente y CI/CD: GitHub.
- Backend: Azure Functions Runtime 4, Node.js 24, plan Flex Consumption.
- Despliegue: GitHub Actions con OIDC, sin perfil de publicación compartido.
- Protección de API: Microsoft Entra ID.
- SharePoint: Graph con `Sites.Selected`, limitado al sitio de facturas.
- Excel: conector Excel Online (Business) de Power Automate; Graph no admite permisos de aplicación para las APIs de libro.
- Secretos: identidad administrada y Key Vault cuando sea necesario; nunca Git ni chat.

## Recursos propuestos

```text
Tenant Microsoft 365 empresarial
├── Sitio privado: /sites/facturas
│   └── Biblioteca: Documentos
│       ├── Facturas/
│       └── Configuracion/RegistroFacturas.xlsx
└── Tabla Excel: tblFacturas

Azure
└── rg-facturas-copilot-dev
    ├── func-facturas-copilot-dev
    ├── cuenta de almacenamiento
    ├── Application Insights
    └── Key Vault
```

Los nombres son provisionales hasta que el cliente los confirme. El esquema Excel está en `deployment/excel-schema.json`.

## Bloqueo actual

La recepción y el archivado de PDF sin Power Automate ya funcionan. Los tres ajustes operativos quedaron declarados como parámetros Bicep para sobrevivir a nuevos despliegues. Quedan pendientes Power Automate Premium/AI Builder, los flujos, los parámetros de negocio y la aceptación CA-01 a CA-21 completa.

## Información que debe proporcionar el cliente

### Acceso e infraestructura

- Tenant ID y dominio `*.onmicrosoft.com`.
- Suscripción Azure y permiso para crear recursos.
- Región Azure autorizada: preferencia inicial Spain Central o West Europe.
- Cuenta de desarrollo/servicio y responsables de las conexiones.
- Confirmación de licencias Power Automate, AI Builder/Copilot Credits y Copilot.

### Microsoft 365

- Buzón y carpeta de entrada.
- URL del sitio SharePoint o autorización para crearlo.
- Biblioteca, carpetas, permisos, retención y versionado.
- Ubicación, propietarios y política de edición del Excel.
- Modelo publicado o autorización para configurar AI Builder.

### Reglas de negocio

- Formatos y tamaño máximo admitidos.
- Destino de presupuestos y otros documentos.
- Patrón definitivo del nombre PDF.
- Campos obligatorios, moneda y regla de vencimiento ausente.
- Clave/tolerancia de duplicados.
- Umbrales de confianza.
- Responsables y canal de excepciones.
- Volumen esperado e idiomas.

Estas decisiones se consolidarán contra el PRD vigente v4.

## Siguiente secuencia

1. Redesplegar y verificar la clasificación con los tres tipos de documento.
2. Conectar extracción y validación al buzón con estado persistente e idempotencia.
3. Incorporar progresivamente los proveedores autorizados al maestro.
4. Crear los flujos Power Automate de registro, conciliación y revisión.
5. Ejecutar la aceptación restante CA-01 a CA-21 y conservar evidencia.

## Comandos de comprobación

```powershell
npm test
npm run check:m365
git status --short --branch
```
