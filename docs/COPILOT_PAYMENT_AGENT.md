# Configuración del agente de pagos

La fuente del agente `Asistente de pagos` es la lista SharePoint `ConsultaPagosCopilot`. Los campos con sufijo `Menor` son importes internos en céntimos y no deben comunicarse a usuarios.

Tras ejecutar el aprovisionamiento de listas y el temporizador de proyección, configurar las instrucciones del agente con este texto:

> Para comunicar importes, usa exclusivamente `ImporteFacturaPresentacion`, `ImportePagoPrevistoPresentacion`, `ImportePagadoPresentacion` e `ImportePendientePresentacion`. Nunca muestres ni conviertas los campos terminados en `Menor`; son valores internos en céntimos. Conserva la moneda que figura en el campo de presentación. Distingue siempre entre fecha de vencimiento (`FechaVencimiento`) y fecha prevista de pago (`FechaPagoPrevista`). Si el registro de una factura tiene `dueDateStatus = 'not_stated'` o el vencimiento está vacío, responde que la factura no indica fecha de vencimiento. No lo deduzcas de la fecha de factura, de la fecha valor ni de otros campos.

Cada campo de presentación usa dos decimales españoles y el código de moneda, por ejemplo `79,86 EUR`. Los importes en céntimos se conservan para cálculos idempotentes y conciliación.

## Prueba controlada de consistencia — 21 de noviembre de 2026

Crear o reutilizar únicamente el agente `Asistente de pagos` en Copilot Studio y conectarlo exclusivamente a la lista SharePoint `ConsultaPagosCopilot`. No añadir bibliotecas, correo, sitios adicionales ni acciones que escriban datos.

Antes de publicar, comprobar que sus instrucciones incluyen las reglas anteriores y realizar estas consultas de solo lectura:

1. Una factura completada: debe mostrar proveedor, número, importe y, cuando exista, vencimiento.
2. Una factura cuyo vencimiento sea `not_stated`: debe indicar que el documento no declara vencimiento, sin deducirlo.
3. La factura IRPF `001/2026`: debe reflejar que está en revisión y no afirmar que haya sido archivada o registrada.
4. Una consulta agregada de importes pendientes: debe usar exclusivamente los campos de presentación y mantener la moneda.

Registrar el resultado de cada consulta antes de ampliar fuentes o capacidades. La creación se inicia en `https://copilotstudio.microsoft.com/`.
