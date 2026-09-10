# Despliegue desde GitHub con OIDC

El workflow `.github/workflows/deploy-azure.yml` usa OpenID Connect: no se crea ni almacena ningún secreto de cliente de Azure.

Las acciones oficiales usan generaciones compatibles con Node 24 (`actions/checkout@v6`, `actions/setup-node@v6` y `azure/login@v3`). El host de Functions usa `AzureWebJobsStorage__accountName` con credencial `managedidentity`, evitando tanto secretos de Storage como la advertencia del validador de despliegue.

## Identidad de desarrollo creada

- Aplicación Entra: `facturas-copilot-github-deploy-dev`.
- Client ID: `7db41108-d13f-4c3e-920a-832e875e1caa`.
- Confianza: rama `main` y entorno GitHub `dev` del repositorio identificado de forma inmutable por GitHub.
- Roles Azure: `Contributor` y `Role Based Access Control Administrator`, ambos limitados a `rg-facturas-copilot-dev`. El segundo es necesario para que Bicep pueda crear las asignaciones RBAC de la identidad administrada de la Function App.

## Configuración pendiente en GitHub

En el repositorio, abrir **Settings → Secrets and variables → Actions** y crear estos *repository secrets*:

| Nombre | Valor |
|---|---|
| `AZURE_CLIENT_ID` | `7db41108-d13f-4c3e-920a-832e875e1caa` |
| `AZURE_TENANT_ID` | `a1a2b397-4ac5-4f94-9004-67f158ea14e0` |
| `AZURE_SUBSCRIPTION_ID` | `e7e239ec-59fb-4128-b9e1-b7854f426f4d` |

Crear además la *repository variable* `ENTRA_API_CLIENT_ID` con valor `66e78b9f-fbbe-4e80-beda-83469b6fee8c`.

Después, en **Actions**, ejecutar manualmente **Deploy Azure Function** con `environment=dev` y `location=spaincentral`. El workflow ejecuta pruebas, aplica Bicep y publica la Function App.
