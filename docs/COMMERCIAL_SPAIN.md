# Propuesta de servicio — España

Actualizado: 15 de septiembre de 2026  
Estado: base para decisión de Gerencia; no constituye una oferta económica cerrada.

## Decisión recomendada

Comercializar el producto como **implantación + servicio gestionado mensual + consumo cloud transparente**, no como precio exclusivamente por factura. El coste marginal de procesar una factura es bajo; el valor para el cliente está en la configuración segura, la continuidad operativa, la trazabilidad, las reglas de negocio y la gestión de excepciones.

El primer mercado es España. Cada cliente debe disponer de su propio tenant Microsoft 365 y suscripción Azure: conserva la titularidad y control de facturas, buzón, SharePoint, extractos, credenciales y datos personales. La solución se despliega en ese entorno, no en un entorno compartido de Integramente.

## Alcance por fases

### Fase 1 — Operación con ficheros

- Recepción de facturas por buzón Microsoft 365 y archivo en SharePoint.
- Extracción fiscal, validación contra proveedores autorizados, duplicados y excepciones.
- Carga periódica de extracto bancario CSV/Excel y de previsión de pagos Excel.
- Propuesta explicable de conciliación por importe, moneda, fecha, referencia y contraparte.
- Confirmación humana de cualquier propuesta; no se ejecutan pagos.

La fase 1 **no requiere API bancaria**. Así se puede demostrar valor y validar el formato real del banco antes de negociar o integrar un conector.

### Fase 2 — API bancaria

- Proyecto separado por banco: contrato, canal técnico, credenciales, consentimientos, mapeo, pruebas y monitorización.
- No se presupone que el banco proporcione la API sin coste ni que todos los bancos expongan el mismo modelo.
- Sustituye la carga manual del extracto; no cambia la seguridad ni las reglas del núcleo de conciliación.

## Validación técnica actual

- Facturas SATINFO, EMAS y Endesa procesadas y archivadas correctamente en el piloto.
- Endesa usa un perfil de confianza aprobado por proveedor, condicionado a NIF exacto, proveedor activo y coherencia fiscal; no rebaja los umbrales globales.
- Se validó una simulación del extracto bancario de 46 movimientos, con 16 abonos positivos y 30 cargos negativos.
- Resultado esperado de conciliación: SATINFO `high` (90 puntos); Endesa `probable` por pago neto de comisión de 0,02 EUR; EMAS sin propuesta porque se compone de dos cobros parciales de 30 y 25 EUR.
- La importación se versiona mediante `BANK_IMPORT_PROFILE`. El perfil del CSV de prueba es `bankinter-simulated-csv-v1`; el perfil anterior `standard-es-v1` se mantiene para rollback.

Pendiente: definir el formato real del Excel de previsión de pagos y añadir su importador. El motor de matching ya es determinista; el trabajo es acordar columnas, estados y reglas de negocio.

## Costes cloud y unidad de consumo

El flujo actual no emplea Azure OpenAI ni otro LLM. Por tanto, el coste de tokens de IA es **cero**.

La lectura de una factura se factura en Azure Document Intelligence por páginas procesadas, no por tokens. El flujo usa lectura de clasificación de las primeras dos páginas y, solo si el documento es factura, el modelo preconfigurado `prebuilt-invoice`. Azure contabiliza una página por cada página PDF/TIFF analizada; el modelo F0 ofrece hasta 500 páginas mensuales para pruebas y S0 debe usarse para producción.

Fórmula de estimación mensual:

```text
Coste DI ≈ N × (min(páginas medias, 2) × tarifa Read + páginas medias × tarifa Prebuilt Invoice)
```

Como referencia orientativa, una factura de una o dos páginas suele producir un coste variable del orden de 0,01–0,03 USD antes de impuestos y conversión de moneda; a 50 facturas/mes, aproximadamente 1–2 USD/mes. El importe definitivo debe obtenerse en la calculadora Azure con región, divisa y contrato del cliente; no usar esta estimación como precio contractual.

El matching de extracto frente a previsión no usa IA ni tokens. A bajo volumen, su coste incremental es principalmente Azure Functions y normalmente queda dentro de las franquicias de consumo; Storage, monitorización y retención deben incluirse en el presupuesto.

Fuentes vigentes consultadas el 15/09/2026:

- [Precios Azure Document Intelligence](https://azure.microsoft.com/es-es/pricing/details/document-intelligence/)
- [Facturación y límites de Document Intelligence](https://learn.microsoft.com/en-us/azure/ai-services/document-intelligence/service-limits?tabs=v30&view=doc-intel-3.0.0)
- [Precios Azure Functions](https://azure.microsoft.com/es-es/pricing/details/functions/)

## Licencias y recursos mínimos

| Elemento | Necesidad |
|---|---|
| Microsoft 365 | Exchange Online para el buzón y SharePoint Online para biblioteca y listas. Una suite Business/Microsoft 365 que ya los incluya suele ser suficiente; confirmar licencias existentes del cliente. |
| Azure | Suscripción del cliente, grupo de recursos, Azure Functions Flex Consumption, Storage, Application Insights/Log Analytics y Azure AI Document Intelligence S0 en producción. |
| Microsoft Entra ID / Graph | Registro de aplicación e identidad administrada. Las operaciones normales de Graph empleadas no son APIs medidas. |
| API bancaria | Solo en fase 2: contrato y condiciones específicas del banco. |

No se requiere Power Apps, Power Automate Premium ni Copilot para la automatización base. Podrán valorarse posteriormente si se solicita una interfaz adicional para usuarios.

## Modelo comercial propuesto

| Partida | Modelo |
|---|---|
| Implantación | Precio cerrado: descubrimiento, seguridad, despliegue en tenant del cliente, mapeo de documentos/extractos/previsión, pruebas, formación y puesta en marcha. |
| Servicio mensual | Cuota por monitorización, soporte, actualizaciones, mantenimiento de reglas y seguimiento de excepciones. |
| Volumen | Bolsa mensual incluida —por ejemplo 50 o 100 facturas— y suplemento por bloques adicionales, no necesariamente por documento individual. |
| Azure/Microsoft | Coste directo del cliente o repercusión transparente a coste, claramente separado de la cuota de servicio. |
| Integraciones | Presupuesto independiente por ERP, formato de previsión específico o API bancaria. |

Los importes se presentan en EUR, sin IVA, indicando “IVA aplicable”. Administración/asesoría debe confirmar el tratamiento fiscal de cada oferta concreta.

## Protección de datos y residencia

- Azure Functions del piloto: Spain Central. Document Intelligence del piloto: North Europe. Ambas ubicaciones están en Europa.
- Para un cliente español se deben desplegar recursos en regiones UE, documentar el flujo de datos, aplicar mínimo privilegio y acordar conservación/borrado de documentos y registros.
- El contrato debe incluir el encargo de tratamiento RGPD y la relación de subencargados aplicables. El cliente sigue siendo responsable del tratamiento.
- Si el cliente exige requisitos reforzados de residencia, validar el EU Data Boundary antes de crear recursos: su configuración no es retrospectiva para tenants ya poblados.

Fuentes:

- [Guía AEPD para clientes cloud](https://www.aepd.es/guias/guia-cloud-clientes.pdf)
- [EU Data Boundary — Microsoft Learn](https://learn.microsoft.com/es-es/azure/azure-resource-manager/management/manage-data-boundary)

## Próximas decisiones de Gerencia

1. Elegir modelo: implantación + cuota mensual recomendada, o alternativa de bolsa de documentos.
2. Definir bolsa inicial (50/100 facturas mensuales) y SLA de soporte.
3. Solicitar al cliente muestra anonimizada de su previsión de pagos Excel.
4. Confirmar si la fase 1 se limita a cargas manuales o incluye API bancaria desde el inicio.
5. Confirmar requisitos de residencia, retención, RGPD y responsables del cliente.
