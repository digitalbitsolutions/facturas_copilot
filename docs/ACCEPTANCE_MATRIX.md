# Matriz de aceptación v3
Estados: `Automatizado local`, `Preparado`, `Requiere tenant` y `Requiere muestra/decisión`.

| Criterio | Estado actual | Evidencia pendiente |
|---|---|---|
| CA-01 Factura válida completa | Automatizado local | Repetir con Outlook, Document Intelligence y SharePoint |
| CA-02 No consumir extracción para no factura | Automatizado local | Confirmar telemetría de Azure Functions |
| CA-03 Varios adjuntos independientes | Automatizado local | Repetir con correo real de prueba |
| CA-04 Presupuesto no registrado como factura | Automatizado local | Repetir con clasificador seleccionado |
| CA-05 Factura incompleta a excepción | Automatizado local | Validar vista de revisión |
| CA-06 Posible duplicado | Automatizado local | Validar clave con contabilidad |
| CA-07 Reintento sin duplicidad | Automatizado local | Simular fallos en conexiones reales |
| CA-08 Trazabilidad hasta PDF | Preparado | Requiere sitio y libro/listas |
| CA-09 Consulta de factura con fuente | Preparado | Requiere Copilot y datos del tenant |
| CA-10 Agregación de periodo | Preparado | Requiere Copilot y conjunto esperado |
| CA-11 Distinguir previsión/propuesta/pago | Preparado | Requiere agente y preguntas de evaluación |
| CA-12 Permisos de usuario | Preparado | Requiere dos usuarios del tenant |
| CA-13 Importación válida | Automatizado local | Repetir con Excel representativo |
| CA-14 Esquema bancario inválido | Automatizado local | Repetir con un extracto representativo en SharePoint |
| CA-15 Reimportación idempotente | Automatizado local | Validar persistencia real |
| CA-16 Pago exacto explicable | Automatizado local | Calibrar reglas con muestra |
| CA-17 Ambigüedad a revisión | Automatizado local | Repetir contra `Conciliaciones` en SharePoint |
| CA-18 Confirmación auditada | Automatizado local | Repetir con repositorio e identidad real |
| CA-19 Rechazo auditado | Automatizado local | Repetir con repositorio e identidad real |
| CA-20 Casos complejos de pago | Requiere muestra/decisión | Definir pagos parciales/agrupados/abonos |
| CA-21 Consultas de conciliación | Preparado | Requiere Copilot y datos del tenant |

La aceptación formal se realizará con documentos anonimizados o autorizados y conservará identificador de ejecución, fecha, resultado observado y evidencia enlazada.
