# Cambios realizados — 24 de septiembre de 2026

## Consultas de pagos y conciliación

- `ConsultaPagosCopilot` publica importes listos para comunicar: factura, pago previsto, pago realizado y pendiente con dos decimales y moneda, por ejemplo `79,86 EUR`. Los campos en céntimos se mantienen para cálculo y conciliación.
- Se añadieron las cuatro columnas de presentación a la lista existente y se configuraron instrucciones persistentes del agente `Asistente de pagos` para usarlas.
- Se corrigió la proyección de previsiones: cuando una previsión pasa a `Pendiente` sin fecha, limpia `FechaPagoPrevista` en vez de conservar una fecha histórica.
- Se validó CA-10: el agente agrega pagos por periodo con un resultado verificable.
- Se validó CA-21 con el caso sintético auditable `CA21-FACTURA-82316bb87a82`, conciliado por 100,00 EUR con referencia `CA21-PAGO-100`.

## Archivo de facturas

- Se conserva la estructura `Facturas/<PROVEEDOR>/`: la carpeta se crea automáticamente cuando llega la primera factura del proveedor y no se repite el proveedor en el nombre del PDF.
- La fecha del nombre de los nuevos PDFs pasa de `AAAA-DDMM` a ISO `AAAA-MM-DD`.
- Patrón vigente: `Facturas/<PROVEEDOR>/<NUMERO_FACTURA>_<AAAA-MM-DD>_<IMPORTE>_<MONEDA>.pdf`.
- Los documentos ya archivados no se renombran.

## Validación y despliegues

- Las correcciones se validaron con 77 pruebas automatizadas superadas.
- Los despliegues de Function realizados por GitHub Actions conservaron los parámetros operativos activos.
- La matriz y las evidencias de aceptación se actualizaron en `docs/ACCEPTANCE_MATRIX.md` y `docs/ACCEPTANCE_2026-09-22.md`.

## Operación posterior

Para limpiar únicamente los datos de la campaña de pruebas y conservar los proveedores y la configuración, seguir [DATA_RESET_RUNBOOK.md](./DATA_RESET_RUNBOOK.md).
