# Implantación en un tenant distinto

## Propósito

El tenant `integramente.onmicrosoft.com` fue exclusivamente un entorno de desarrollo y validación. No se migran de él datos, identidades, permisos, aplicaciones, suscripciones ni recursos. El repositorio, las pruebas automatizadas y los procedimientos documentados constituyen el artefacto reutilizable para implantar la solución en el tenant destino.

Las evidencias funcionales existentes demuestran el comportamiento del circuito, pero la aceptación y los permisos se deben repetir en el tenant destino con sus propios usuarios, buzón, documentos autorizados y políticas.

## Separación de responsabilidades

| Se reutiliza desde el repositorio | Se crea o confirma en el tenant destino |
|---|---|
| Código TypeScript, pruebas y Bicep | Suscripción Azure, grupo de recursos y regiones aprobadas |
| Esquemas, listas, carpetas y scripts de aprovisionamiento | Sitio SharePoint privado, biblioteca, buzón y propietarios |
| Workflow de CI/CD y patrón OIDC | Registros Entra, federación OIDC y secretos/variables de GitHub |
| Reglas de validación, idempotencia y conciliación | Maestro de proveedores, perfil del extracto y previsiones reales |
| Runbooks y matriz de aceptación | Retención, RGPD, roles de revisión y evidencias de aceptación |

No copiar valores de `integramente.onmicrosoft.com`, IDs Graph, IDs de identidades administradas, URLs de recursos, Client IDs, suscripciones ni datos de prueba. Tampoco se copian PDFs, correos, extractos o previsiones de desarrollo salvo que exista autorización documentada.

## Datos necesarios antes de desplegar

1. Tenant ID, dominio y suscripción Azure del cliente; un administrador con permisos para Entra, Exchange, SharePoint y la suscripción.
2. Buzón dedicado de recepción y responsables operativos. La Function solo tendrá lectura sobre ese buzón.
3. URL del sitio SharePoint privado y sus propietarios. Crear o autorizar las carpetas `Facturas`, `ExtractosBancarios`, `Procesados`, `Errores`, `PrevisionesPagos`, `ProcesadosPrevisiones`, `ErroresPrevisiones` y `Configuracion`.
4. Regiones UE aprobadas, retención de Application Insights/Log Analytics, clasificación de datos y acuerdo RGPD.
5. Muestra autorizada de facturas, extracto bancario y previsión de pagos; decisión sobre el perfil del extracto y las reglas de conciliación.
6. Propietario de excepciones, responsable de conciliaciones y, si se utilizará, licencia/configuración de Copilot Studio.

## Secuencia de implantación

1. Crear el registro Entra de la API con `scripts/create-api-registration.ps1` y conservar su Client ID como variable `ENTRA_API_CLIENT_ID` del entorno de GitHub.
2. Crear una aplicación de despliegue OIDC limitada al grupo de recursos nuevo. Configurar `AZURE_CLIENT_ID`, `AZURE_TENANT_ID` y `AZURE_SUBSCRIPTION_ID` en el entorno de GitHub correspondiente. Consultar `docs/GITHUB_OIDC.md` como patrón, pero crear una federación e identidad nuevas.
3. Crear el sitio SharePoint y ejecutar `provision-sharepoint-folders.ps1` y `provision-sharepoint-lists.ps1` autenticándose como propietario del sitio, pasando explícitamente el `HostName` y el `SitePath` del tenant destino. Cargar únicamente el maestro de proveedores aprobado.
4. Resolver mediante Graph el `M365_SHAREPOINT_SITE_ID` y el `M365_SHAREPOINT_DRIVE_ID`. Verificar que el segundo comienza por `b!`; nunca usar el Site ID en su lugar.
5. Ejecutar el workflow **Deploy Azure Function** con el entorno nuevo, procesamiento de facturas y previsiones en `false`, y corte `9999-12-31T23:59:59Z`. El workflow exige ahora explícitamente `m365_mailbox_address`, `m365_sharepoint_site_id` y `m365_sharepoint_drive_id`; son identificadores no secretos y evitan reutilizar el tenant de desarrollo.
6. Con el principal de identidad administrada que devuelve el despliegue, otorgar `Sites.Selected` exclusivamente al sitio nuevo usando `grant-function-sharepoint-access.ps1`. Otorgar Exchange Application RBAC exclusivamente al buzón nuevo usando `grant-function-mailbox-rbac.ps1`. No conceder `Mail.Read` global a la identidad.
7. Comprobar que la Function tiene los tres valores M365 correctos, que todos los endpoints devuelven `401` sin token y que el sondeo deja constancia de estar desactivado.
8. Configurar `INVOICE_PROCESSING_NOT_BEFORE` al instante UTC de inicio de una prueba limpia. Activar primero solo facturas y ejecutar una prueba de un PDF autorizado. Después repetir la campaña de tres facturas y la matriz de aceptación aplicable.
9. Activar importaciones bancarias y de previsiones solo tras validar formato, idempotencia y responsables. Mantener la aceptación automática de conciliaciones desactivada.
10. Configurar el agente de Copilot Studio solo contra `ConsultaPagosCopilot`, con las instrucciones de `docs/COPILOT_PAYMENT_AGENT.md`; validar permisos con al menos dos usuarios antes de su uso operativo.

## Controles obligatorios

- Producción debe usar Document Intelligence S0; F0 queda reservado a prueba y está limitado por cuota.
- No habilitar `INVOICE_PROCESSING_ENABLED` hasta que existan las listas, el maestro y el corte temporal.
- Cada ejecución de despliegue debe llevar los tres identificadores M365 del entorno. Bicep no contiene valores por defecto del tenant de desarrollo.
- Repetir CA-01 a CA-21 según corresponda. La matriz actual identifica qué pruebas están automatizadas, validadas en desarrollo o pendientes de muestra/decisión.
- Antes de datos reales, acordar umbrales, perfiles por proveedor, formato bancario, retención, acceso a listas y procedimiento de excepciones.

## Evidencia y cierre

Conservar para el tenant destino: SHA desplegado, resultado de `npm run check`, IDs de recursos, prueba de RBAC de Exchange y SharePoint, capturas/enlaces de listas, trazas de Application Insights y resultado de cada criterio de aceptación. Los runbooks `MAILBOX_PILOT_RUNBOOK.md`, `TEST_CAMPAIGN_2026-09-24_RUNBOOK.md`, `DATA_RESET_RUNBOOK.md` y las evidencias de aceptación se usan como guías, sustituyendo todos los enlaces y valores del tenant de desarrollo.
