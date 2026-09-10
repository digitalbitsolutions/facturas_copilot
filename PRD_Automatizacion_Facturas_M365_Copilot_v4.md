# PRD — Facturas y conciliación bancaria sin Power Automate

```yaml
estado: piloto-en-desarrollo
versión: 4.0
fecha: 2026-09-10
arquitectura: Azure Functions + Microsoft Graph + SharePoint + SharePoint Lists
excluido: Power Automate, conectores Premium, conexión bancaria, pagos y contabilización ERP
```

## 1. Objetivo

Automatizar la recepción, custodia, validación y registro de facturas recibidas por correo, y la importación de extractos bancarios para conciliación explicable. La solución no utiliza Power Automate ni requiere licencias Power Automate Premium.

```text
Exchange Online ──► Azure Function programada ──► SharePoint /Facturas
                         │                              │
                         ├──► validación / excepciones ──┘
                         │
SharePoint /ExtractosBancarios ─► Azure Function ─► Lists: lotes y movimientos
                                                        │
                                                 motor de conciliación
```

## 2. Alcance

### Incluido

- Consulta programada del buzón compartido `facturas-pruebas@integramente.onmicrosoft.com`.
- Lectura de mensajes y adjuntos PDF, sin modificar, mover, enviar ni borrar correo.
- Archivo idempotente de PDF en SharePoint `Facturas`.
- Procesamiento independiente de adjuntos y trazabilidad por mensaje y adjunto.
- Carga manual de `.xlsx`, `.xls` o `.csv` en `ExtractosBancarios`.
- Validación, normalización e importación de extractos en SharePoint Lists.
- Movimiento de extractos correctos a `Procesados` y fallidos a `Errores`.
- Detección de duplicados, excepciones y conciliación determinista explicable.
- Consulta futura con Copilot solo sobre fuentes y permisos autorizados.

### Excluido

- Power Automate, conectores Premium y RPA.
- AI Builder como requisito de la fase actual; podrá añadirse con capacidad aprobada.
- Acceso directo a bancos, pagos, transferencias y contabilización ERP.
- Modificar correo: marcar leído, mover, eliminar, responder o reenviar.

## 3. Arquitectura y seguridad

| Componente | Responsabilidad |
|---|---|
| Azure Function Flex Consumption | Temporizadores, reglas, idempotencia y API protegida |
| Identidad administrada | Autenticación sin secretos frente a Graph |
| Exchange Application RBAC | `Application Mail.Read` limitado al buzón de pruebas |
| Microsoft Graph | Lectura de correo/adjuntos y acceso restringido a SharePoint |
| SharePoint | Repositorio de PDF y extractos |
| SharePoint Lists | `ImportacionesBancarias`, `MovimientosBancarios`, `Excepciones` |
| Application Insights | Trazas, errores y métricas |

La identidad de la Function tiene `Sites.Selected` solo para `/sites/facturas`. Para correo, la asignación Exchange RBAC `FacturasCopilot-facturas-pruebas-Only` debe ser el único permiso efectivo de lectura. No se concede `Mail.Read` global directamente en Entra.

## 4. Flujos

### 4.1 Facturas por correo

1. Cada diez minutos, la Function consulta la bandeja de entrada del buzón de pruebas.
2. Identifica mensajes con adjuntos PDF y procesa cada adjunto por separado.
3. Archiva el PDF bajo una clave determinista en `Facturas`; reintentos no duplican el archivo.
4. Un fallo se registra en `Excepciones`; un adjunto fallido no bloquea los demás.
5. La extracción de datos y el alta definitiva de factura se habilitarán tras aprobar motor de extracción y esquema de registro.

### 4.2 Extractos bancarios

1. Un usuario autorizado sube un extracto al directorio `ExtractosBancarios`.
2. La Function lee la primera hoja y exige: `IdMovimiento`, `FechaMovimiento`, `FechaValor`, `Concepto`, `Importe`, `Moneda`, `Referencia`, `Contraparte`.
3. Calcula hash, valida cabeceras, fecha, importe, moneda, signo y duplicados.
4. Guarda lote y movimientos normalizados en Lists, o registra excepción.
5. Mueve el archivo a `Procesados` o `Errores` sin sobrescribir el original.

### 4.3 Conciliación

El motor compara importe, moneda, referencia, contraparte y proximidad de fecha. Clasifica `Alta`, `Probable`, `Revisar` o `Sin coincidencia`. Las coincidencias ambiguas nunca se aceptan automáticamente. La aceptación automática de `Alta` requiere aprobación expresa de gerencia.

## 5. Requisitos funcionales

| ID | Requisito | Prioridad |
|---|---|---|
| RF-01 | Leer únicamente el buzón configurado mediante RBAC. | Must |
| RF-02 | Archivar adjuntos PDF idempotentemente en SharePoint. | Must |
| RF-03 | No modificar mensajes ni enviar correo. | Must |
| RF-04 | Registrar fallos y adjuntos no procesables en excepciones. | Must |
| RF-05 | Importar extractos con esquema versionado y hash. | Must |
| RF-06 | Evitar movimientos y lotes duplicados. | Must |
| RF-07 | Conservar archivo fuente y datos normalizados. | Must |
| RF-08 | Proponer conciliaciones explicables y conservadoras. | Must |
| RF-09 | Permitir revisión y reproceso con auditoría. | Should |
| RF-10 | Extraer campos de factura con un motor aprobado. | Should |

## 6. Requisitos no funcionales

- Mínimo privilegio, sin secretos en código ni en repositorio.
- Reintentos seguros; correlación por mensaje, adjunto, archivo y lote.
- Ejecución cada diez minutos: extractos en segundo 0, correo en segundo 30.
- Observabilidad en Application Insights y retención conforme a política del tenant.
- Datos reales solo tras pruebas satisfactorias con documentos autorizados.

## 7. Criterios de aceptación

| ID | Escenario |
|---|---|
| CA-01 | Un PDF enviado al buzón se archiva una vez en `Facturas`. |
| CA-02 | La identidad no puede leer otro buzón; Exchange RBAC informa `InScope=True` solo para el autorizado. |
| CA-03 | Reintentar no duplica el PDF. |
| CA-04 | Un extracto válido crea lote y movimientos en Lists. |
| CA-05 | Un extracto inválido acaba en `Errores` con excepción accionable. |
| CA-06 | Reimportar un archivo no duplica movimientos. |
| CA-07 | Una coincidencia ambigua queda en revisión. |

## 8. Decisiones pendientes

1. Motor de extracción de facturas y presupuesto/capacidad, si procede.
2. Esquema definitivo de factura y repositorio maestro.
3. Patrón de nombre final, retención y permisos de `Facturas`.
4. Umbrales y autorización de aceptación automática de conciliación.
5. Responsables y canal de resolución de excepciones.
6. Preguntas y fuentes autorizadas para Copilot.

## 9. Control de cambios

| Versión | Fecha | Cambio |
|---|---|---|
| 3.0 | 2026-09-08 | Facturas y conciliación con Power Automate previsto. |
| 4.0 | 2026-09-10 | Sustituye Power Automate por Azure Functions, Graph, RBAC y SharePoint Lists. |
