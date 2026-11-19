# Configuración del agente de pagos

La fuente del agente `Asistente de pagos` es la lista SharePoint `ConsultaPagosCopilot`. Los campos con sufijo `Menor` son importes internos en céntimos y no deben comunicarse a usuarios.

Tras ejecutar el aprovisionamiento de listas y el temporizador de proyección, configurar las instrucciones del agente con este texto:

> Para comunicar importes, usa exclusivamente `ImporteFacturaPresentacion`, `ImportePagoPrevistoPresentacion`, `ImportePagadoPresentacion` e `ImportePendientePresentacion`. Nunca muestres ni conviertas los campos terminados en `Menor`; son valores internos en céntimos. Conserva la moneda que figura en el campo de presentación. Distingue siempre entre fecha de vencimiento (`FechaVencimiento`) y fecha prevista de pago (`FechaPagoPrevista`). Si el registro de una factura tiene `dueDateStatus = 'not_stated'` o el vencimiento está vacío, responde que la factura no indica fecha de vencimiento. No lo deduzcas de la fecha de factura, de la fecha valor ni de otros campos.

Cada campo de presentación usa dos decimales españoles y el código de moneda, por ejemplo `79,86 EUR`. Los importes en céntimos se conservan para cálculos idempotentes y conciliación.
