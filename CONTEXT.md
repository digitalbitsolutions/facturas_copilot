# Contexto de reanudación

Actualizado: 8 de septiembre de 2026.

## Objetivo

Automatizar la recepción y gestión de facturas en Microsoft 365: correo, clasificación, extracción con AI Builder, validación, detección de duplicados, archivo en SharePoint, registro Excel y consultas mediante Copilot. La conciliación bancaria queda fuera de la fase 1.

## Estado actual

- Repositorio: `https://github.com/digitalbitsolutions/facturas_copilot`.
- Rama de trabajo: `main`.
- Runtime local: Node.js 24, TypeScript ejecutado en modo nativo para desarrollo.
- Núcleo de factura terminado: campos, fechas, importes, moneda, confianza, coherencia, nombres seguros y clave de duplicidad.
- Procesador terminado: estados, excepciones, idempotencia, reproceso y aislamiento por adjunto.
- Integración preparada: configuración M365, cliente Graph y adaptador de documentos SharePoint con pruebas simuladas.
- Pruebas actuales: 22 superadas.
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
              Excel Online mediante Power Automate
                         ↓
                  Copilot / Copilot Studio
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

Se espera que el cliente proporcione o apruebe el tenant Microsoft 365, la suscripción Azure, las credenciales administradas y los parámetros funcionales. La cuenta personal Microsoft 365 mostrada durante la sesión no incluye SharePoint; se ha identificado Microsoft 365 Empresa Básico como base mínima, con Power Automate Premium/capacidad de IA sujeta a validación de licencias.

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

Estas decisiones corresponden a DP-01 a DP-15 del PRD.

## Siguiente secuencia

1. Completar `.env` local con identificadores no secretos y ejecutar `npm run check:m365`.
2. Crear sitio, biblioteca, carpetas, libro y tabla.
3. Crear la suscripción/recursos Azure.
4. Convertir el proyecto en una Function App compilable y añadir endpoints HTTP.
5. Configurar Entra, identidad administrada, `Sites.Selected` y OIDC de GitHub.
6. Crear el flujo Power Automate y conexiones de Outlook, Excel y AI Builder.
7. Probar con facturas anonimizadas y registrar evidencia de CA-01 a CA-12.

## Comandos de comprobación

```powershell
npm test
npm run check:m365
git status --short --branch
```
