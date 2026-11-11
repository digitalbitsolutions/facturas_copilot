# Estado de implantación y modelo de acceso

Texto preparado para enviar a Néstor por WhatsApp.

Hola Néstor,

Te resumo el punto actual para poder continuar la implantación de Facturas Copilot en DENTAL CATALUNYA.

Hoy he avanzado en la preparación del despliegue: he eliminado los identificadores de prueba de los parámetros de infraestructura, el workflow exige ahora los valores propios del tenant destino y los scripts de SharePoint obligan a indicar explícitamente el dominio y la ruta del sitio. La validación local está correcta: 77 pruebas superadas.

También he comprobado que mi usuario invitado `miguel.yesan@emas.es` tiene los roles de Entra `Application Administrator`, `SharePoint Administrator` y `Exchange Administrator`, y `Contributor` sobre `rg-facturas-copilot-prod`. Sin embargo, esa identidad B2B falla al autenticarse con `service_not_available`, incluso con los roles correctos. La autenticación por código de dispositivo con una cuenta interna del tenant sí funciona, por lo que el bloqueo queda aislado al usuario invitado B2B, no al tenant ni a Azure CLI.

La alternativa más estable es crear una cuenta interna temporal y funcional del cliente, `dev-emas@grupmedicdental.com`, sin asociarla a mi nombre. Esta cuenta sustituiría mi usuario invitado únicamente para el acceso a DENTAL CATALUNYA; no solicito `Global Administrator` ni acceso a nivel de suscripción.

Para poder trabajar fuera de horario sin depender de aprobaciones de terceros, necesitaría recibir un acceso inicial seguro a esa cuenta: contraseña temporal o, preferiblemente, un `Temporary Access Pass`. Con él configuraré Microsoft Authenticator en mi móvil. Solicito además que el número del teléfono corporativo que tengo asignado se añada como método de autenticación o recuperación secundaria de `dev-emas@grupmedicdental.com`, si la política de MFA lo permite. Las credenciales y el acceso inicial se entregarían a EMAS por canal seguro.

Para completar la implantación necesitaría temporalmente:

- Entra: `Application Administrator`, `SharePoint Administrator` y `Exchange Administrator`.
- Azure: `Contributor` y `User Access Administrator`, limitados exclusivamente a `rg-facturas-copilot-prod`.
- Microsoft 365: propiedad únicamente sobre el sitio privado `/sites/facturas` cuando se cree.

El alcance Azure es necesario para que pueda desplegar la infraestructura y asignar a la identidad administrada de la Function los permisos RBAC que necesita. El acceso a SharePoint y Exchange se configurará restringido al sitio y al buzón de Facturas; no se concederá `Mail.Read` global a la Function. Al terminar la implantación se retirarán los roles administrativos de la cuenta `dev-emas` y se podrá deshabilitar. Si se contrata soporte, se revisarán y reactivarán solo los permisos necesarios bajo ese acuerdo.

En cuanto al código, lo mantendré en un repositorio oficial de GitHub de EMAS. Transferiré el repositorio actual desde mi cuenta personal a la organización de EMAS, conservando el historial y la trazabilidad. Necesito que `miguel.yesan@emas.es` figure como colaborador del repositorio de EMAS para continuar el desarrollo y atender cambios futuros. Esta dirección se utilizará para GitHub de EMAS, pero no para acceder al tenant de DENTAL CATALUNYA.

No es necesario crear un repositorio GitHub para el cliente. DENTAL CATALUNYA seguirá siendo propietaria de su tenant, datos, buzón, SharePoint y recursos Azure de producción; EMAS mantendrá la responsabilidad técnica del código, los despliegues y el soporte conforme al acuerdo que se establezca.

Azure Functions ejecutará el paquete de la versión ya desplegada; GitHub no interviene en la operación diaria. Si GitHub estuviera temporalmente inaccesible, la Function seguiría funcionando, aunque no podría publicar nuevas versiones hasta recuperar el acceso al repositorio y al flujo de despliegue. Los despliegues de producción los realizaré desde el repositorio de GitHub de EMAS mediante GitHub Actions y OIDC, sin secretos de Azure almacenados en GitHub. La identidad OIDC de GitHub tendrá `Contributor` y `Role Based Access Control Administrator` solamente sobre `rg-facturas-copilot-prod`, necesarios para que Bicep asigne los RBAC de la identidad administrada de la Function.
