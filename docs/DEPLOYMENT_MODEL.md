# Modelo de despliegue y alternativas

## Decisión vigente

La Function App de desarrollo se despliega actualmente desde el repositorio GitHub `digitalbitsolutions/facturas_copilot`, rama `main`, mediante el workflow manual `.github/workflows/deploy-azure.yml`.

El flujo realiza, en este orden:

1. obtiene una revisión concreta de `main`;
2. instala dependencias y ejecuta las comprobaciones del repositorio;
3. inicia sesión en Azure con OpenID Connect (OIDC), sin secreto de cliente;
4. aplica la infraestructura Bicep y conserva los parámetros operativos declarados;
5. publica el paquete de Azure Functions en `func-facturas-copilot-dev-jbhyjbgfzr3iy`.

Por tanto, GitHub es el mecanismo configurado ahora, pero Azure Functions no exige GitHub. La fuente de código debe seguir siendo un repositorio versionado y el despliegue debe publicar un paquete.

## Alternativas

| Alternativa | Uso adecuado | Cambio necesario |
|---|---|---|
| GitHub Actions (vigente) | Desarrollo controlado y despliegues trazables | Ninguno. Mantener el workflow y la federación OIDC actuales. |
| Azure DevOps Pipelines | Organizaciones que estandarizan Azure DevOps | Crear el pipeline equivalente y una federación OIDC o conexión de servicio limitada al grupo de recursos. |
| VS Code, Azure CLI o Azure Functions Core Tools | Desarrollo local o recuperación puntual | Publicar manualmente un paquete. No sustituye el control, las pruebas ni la auditoría del pipeline. |

La Function App usa **Flex Consumption**. En ese plan se admite despliegue basado en paquetes; no se debe utilizar edición directa en el portal, FTP ni Git local como canal de despliegue.

## Dónde se observa el resultado

- En GitHub, **Actions → Deploy Azure Function**, se ve la revisión, las validaciones y el registro del despliegue.
- En Azure Portal, [Function App de desarrollo](https://portal.azure.com/#@integramente.onmicrosoft.com/resource/subscriptions/e7e239ec-59fb-4128-b9e1-b7854f426f4d/resourceGroups/rg-facturas-copilot-dev/providers/Microsoft.Web/sites/func-facturas-copilot-dev-jbhyjbgfzr3iy/overview), se ven el estado, las funciones, los ajustes y los diagnósticos. **Download app content** permite inspeccionar el paquete publicado, pero el código fuente y su historial autorizados residen en GitHub.

## Recomendación

Mantener GitHub Actions mientras no exista una norma corporativa que exija Azure DevOps. Si se migra, no cambia la lógica de la Function ni los datos de SharePoint: cambia solo la canalización de CI/CD y la identidad autorizada para desplegar.

Fuentes: [tecnologías de despliegue de Azure Functions](https://learn.microsoft.com/en-us/azure/azure-functions/functions-deployment-technologies) y [uso de GitHub Actions con Azure Functions](https://learn.microsoft.com/en-us/azure/azure-functions/functions-how-to-github-actions).
