# Contexto de reanudación

Actualizado: 9 de septiembre de 2026.

## Objetivo

Automatizar la recepción y gestión de facturas en Microsoft 365: correo, clasificación, extracción con AI Builder, validación, detección de duplicados, archivo en SharePoint, registro y consultas mediante Copilot. La fase 1 incluye la importación manual de extractos Excel y la conciliación bancaria por reglas, sin conexión directa con bancos ni ejecución de pagos.

## Estado actual

- Repositorio: `https://github.com/digitalbitsolutions/facturas_copilot`.
- Rama de trabajo: `main`.
- Runtime local: Node.js 24, TypeScript ejecutado en modo nativo para desarrollo.
- Núcleo de factura terminado: campos, fechas, importes, moneda, confianza, coherencia, nombres seguros y clave de duplicidad.
- Procesador terminado: estados, excepciones, idempotencia, reproceso y aislamiento por adjunto.
- Integración preparada: configuración M365, cliente Graph y adaptador de documentos SharePoint con pruebas simuladas.
- Importación bancaria y conciliación local terminadas: lotes, validación, normalización, duplicidad, puntuación explicable y ambigüedad.
- Azure Functions v4 preparada con endpoints HTTP; infraestructura Flex Consumption y CI/CD preparadas.
- Pruebas actuales: 33 superadas.
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
- La identidad administrada de la Function App (`23530c7b-95c2-44bf-b949-36750c962917`) tiene permiso de aplicación `Sites.Selected` y rol `write` únicamente sobre `https://integramente.sharepoint.com/sites/facturas`.
- OIDC de GitHub preparado: aplicación `facturas-copilot-github-deploy-dev` (Client ID `7db41108-d13f-4c3e-920a-832e875e1caa`), restringida a `digitalbitsolutions/facturas_copilot` en la rama `main` y Contributor solo en `rg-facturas-copilot-dev`. Falta registrar sus valores en GitHub Actions.
- No existe aún ningún recurso productivo ni credencial almacenada.

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

La base de pruebas de Microsoft 365 y la suscripción Azure Trial están disponibles: tenant, licencias, aplicación Entra, sitio SharePoint, carpetas, libro/tablas y listas. Se puede iniciar el despliegue de infraestructura. Siguen pendientes las capacidades Power Automate/AI Builder, el buzón funcional y los parámetros de negocio. No se usará el tenant personal/empresarial distinto que aparece en la sesión habitual del desarrollador.

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

Estas decisiones corresponden a DP-01 a DP-24 del PRD v3.

## Siguiente secuencia

1. Registrar la configuración OIDC en GitHub Actions y ejecutar el workflow de despliegue.
2. Confirmar Power Automate, AI Builder/Copilot Credits y buzón funcional.
3. Crear los flujos Power Automate de facturas, importación y conciliación.
4. Probar con facturas y extractos anonimizados y registrar evidencia de CA-01 a CA-21.

## Comandos de comprobación

```powershell
npm test
npm run check:m365
git status --short --branch
```
