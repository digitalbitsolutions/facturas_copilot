# PRD — Automatización de facturas con Microsoft 365 y Copilot

```yaml
estado: pendiente-de-validación-cliente
versión: 2.0
fecha: 2026-09-07
fuente: PRD_Revision_Cliente_Automatizacion_Facturas_Copilot_v2.docx
fase: 1
alcance: recepción, clasificación, extracción, archivo, registro y consulta
excluido: conciliación bancaria
```

> Especificación funcional para validar el alcance antes de la implantación. Las decisiones marcadas como **Pendiente** deben cerrarse con el cliente antes de producción.

## 1. Resumen ejecutivo

El proyecto automatizará la gestión de facturas recibidas por correo dentro de Microsoft 365. El sistema clasificará los documentos antes de consumir AI Builder, procesará bajo demanda únicamente las facturas, extraerá sus datos, renombrará y archivará los PDF en SharePoint, registrará la información en Excel y permitirá consultas mediante Copilot.

```text
Correo → clasificación ──→ presupuesto/otro → derivación por definir
              ↓ factura
       AI Builder bajo demanda
              ↓
      validación y duplicados ──→ excepción/revisión manual
              ↓
 SharePoint + registro Excel → consultas Copilot
```

La previsión de pagos se basará exclusivamente en fecha de vencimiento e importe. No confirmará pagos reales: la conciliación bancaria y cualquier integración con bancos quedan fuera de esta fase.

## 2. Problema

El proceso actual requiere descargar, clasificar, renombrar, archivar y registrar facturas manualmente. Esto consume tiempo y aumenta el riesgo de pérdida documental, duplicidad y errores de transcripción. Obtener una previsión de vencimientos también exige revisar datos de forma manual.

## 3. Objetivos

- Reducir el tratamiento manual de las facturas.
- Centralizar los PDF en SharePoint con acceso controlado.
- Mantener trazabilidad entre correo, documento y registro.
- Extraer de forma consistente los datos necesarios.
- Consumir AI Builder solo al procesar una factura.
- Consultar proveedores, importes y vencimientos en lenguaje natural.
- Derivar a revisión cualquier caso incompleto, incoherente o de baja confianza.

Durante el piloto se medirá: porcentaje de facturas sin intervención, exactitud de campos obligatorios, tiempo de proceso, excepciones por causa, consumo de AI Builder y exactitud de un conjunto de consultas Copilot. Las metas se fijarán tras confirmar volumen y calidad documental reales.

## 4. Usuarios

| Rol | Necesidad | Acceso esperado |
|---|---|---|
| Administración | Supervisión, excepciones y reproceso | Lectura/escritura operativa |
| Contabilidad | PDF y registro estructurado | Lectura documental y edición autorizada |
| Dirección / gestión | Vencimientos e importes | Lectura y consultas Copilot |
| Administrador M365 | Recursos, conexiones y consumo | Administración técnica |

Se aplicará mínimo privilegio. SharePoint, Excel y Copilot deberán respetar la identidad y permisos del usuario.

## 5. Alcance

### Incluido

- Detección de correo en el buzón o carpeta acordada.
- Lectura independiente de uno o varios adjuntos.
- Clasificación inicial en factura, presupuesto u otro.
- Extracción de facturas con AI Builder bajo demanda.
- Validaciones de integridad, coherencia y duplicidad.
- Renombrado configurable y almacenamiento en SharePoint.
- Alta controlada en un Excel de seguimiento con enlace al PDF.
- Consultas y previsiones mediante Copilot.
- Excepciones, revisión manual, auditoría y reproceso.

### Fuera de alcance

- Conciliación bancaria y lectura de extractos.
- Integración con bancos o marcado de facturas como pagadas.
- Transferencias u órdenes de pago.
- Integración o contabilización automática en ERP.
- Aprobaciones de gasto multinivel.
- Tratamiento completo de presupuestos u otros documentos; solo se clasifican y derivan.
- Facturas emitidas y cuentas a cobrar.

## 6. Flujo funcional

1. Power Automate detecta un correo nuevo y conserva identificador, remitente, asunto y fecha.
2. Enumera los adjuntos y procesa cada uno como unidad independiente.
3. Valida el archivo y lo clasifica antes de invocar extracción documental.
4. Si no es factura, lo deriva según una regla pendiente de confirmar.
5. Si es factura, AI Builder extrae los campos acordados bajo demanda.
6. Se validan campos obligatorios, importes, confianza y posibles duplicados.
7. Un resultado dudoso se conserva y genera una excepción revisable.
8. Un resultado válido genera el nombre configurado y se guarda en SharePoint.
9. Se crea una fila única en Excel con los datos, metadatos y enlace al PDF.
10. La ejecución queda marcada como completada de forma idempotente.
11. Copilot responde consultas sobre los datos autorizados.

Un fallo en un adjunto no impedirá procesar los restantes adjuntos válidos del correo.

## 7. Requisitos funcionales

| ID | Requisito | Prioridad |
|---|---|---|
| RF-01 | Detectar correos en la ubicación configurada y capturar sus metadatos mínimos. | Must |
| RF-02 | Procesar de forma independiente uno o varios adjuntos. | Must |
| RF-03 | Identificar archivos ausentes, no admitidos, corruptos, protegidos o ilegibles. | Must |
| RF-04 | Clasificar cada documento antes de ejecutar AI Builder para extracción. | Must |
| RF-05 | Invocar AI Builder solo para documentos enviados al circuito de facturas. | Must |
| RF-06 | Extraer proveedor, número, fecha, vencimiento, base, IVA y total. | Must |
| RF-07 | Registrar confianza disponible y validar campos mediante umbrales configurables. | Must |
| RF-08 | Detectar posibles duplicados antes de crear el registro definitivo. | Must |
| RF-09 | Renombrar el PDF con el patrón del cliente, saneando caracteres y colisiones. | Must |
| RF-10 | Guardar el PDF en la ubicación acordada de SharePoint. | Must |
| RF-11 | Crear una fila única en Excel y enlazarla con el PDF. | Must |
| RF-12 | Relacionar mensaje, adjunto, ejecución, PDF y fila del registro. | Must |
| RF-13 | Consultar facturas por proveedor, número, fechas e importe con Copilot. | Must |
| RF-14 | Agregar importes por fecha o periodo e identificar los registros del cálculo. | Must |
| RF-15 | Crear una excepción accionable por baja confianza, incoherencia o fallo técnico. | Must |
| RF-16 | Corregir y reprocesar sin duplicar PDF ni fila. | Should |
| RF-17 | Notificar excepciones a los responsables definidos. | Should |
| RF-18 | Registrar resultado, errores y consumo para soporte. | Should |

### Reglas de negocio

- La clasificación siempre precede a la extracción.
- Una factura solo estará completada cuando PDF y registro queden relacionados.
- Una fecha ausente no se inventará: se aplicará una regla aprobada o se revisará.
- Los importes serán numéricos y la moneda se guardará por separado.
- Un posible duplicado no se eliminará automáticamente.
- Copilot mostrará el periodo y los registros fuente de cada agregación.
- El sistema nunca afirmará que una factura está pagada en esta fase.

## 8. Modelo de datos

### Datos de negocio mínimos

| Campo | Tipo recomendado | Obligatorio | Fuente |
|---|---|---:|---|
| ProveedorNombre | Texto | Sí | Factura |
| NumeroFactura | Texto | Sí | Factura |
| FechaFactura | Fecha | Sí | Factura |
| FechaVencimiento | Fecha | Pendiente | Factura/regla |
| BaseImponible | Decimal | Sí | Factura |
| ImporteIVA | Decimal | Sí | Factura |
| TotalFactura | Decimal | Sí | Factura |
| Moneda | ISO 4217 | Pendiente | Factura/regla |
| EnlacePDF | URL | Sí | SharePoint |

### Metadatos operativos recomendados

`FacturaId`, `EstadoProceso`, `MessageId`, `RemitenteCorreo`, `FechaRecepcion`, `NombreArchivoOriginal`, `NombreArchivoFinal`, `SharePointItemId`, `ClaveDuplicado`, `ConfianzaExtraccion`, `MotivoRevision`, `FechaProcesado` y `FlowRunId`.

Campos candidatos pendientes: NIF/CIF, concepto, centro de coste, pedido, proyecto, categoría contable y condiciones de pago.

El Excel usará una tabla estructurada, columnas estables y no tendrá celdas combinadas. Se validarán volumen y concurrencia: si Excel no ofrece la robustez necesaria, un cambio de repositorio necesitará aprobación porque el cliente lo ha establecido para esta fase.

## 9. Nomenclatura y SharePoint

El patrón exacto será configuración proporcionada por el cliente. Ejemplo no vinculante:

```text
{FechaFactura:yyyy-MM-dd}_{Proveedor}_{NumeroFactura}_{Total}_{Moneda}.pdf
```

El sistema reemplazará caracteres incompatibles, limitará longitud, conservará la extensión, evitará sobrescrituras y registrará nombre original y final. La biblioteca, carpetas, metadatos, retención y versionado están pendientes.

## 10. Excepciones

| Código | Situación | Resultado esperado |
|---|---|---|
| EX-01 | Correo sin adjunto | Registrar y cerrar/notificar según regla |
| EX-02 | Archivo no admitido | Derivar sin llamar a AI Builder |
| EX-03 | Presupuesto u otro | Clasificar y derivar fuera del circuito de factura |
| EX-04 | PDF ilegible/protegido | Revisión con motivo explícito |
| EX-05 | Campo obligatorio ausente | No finalizar; solicitar corrección |
| EX-06 | Baja confianza/incoherencia | Mostrar extracción y documento para revisión |
| EX-07 | Posible duplicado | Bloquear alta definitiva hasta confirmar |
| EX-08 | Error de SharePoint | Reintentar sin crear fila huérfana |
| EX-09 | Error de Excel | Reintentar sin duplicar el documento |
| EX-10 | Fallo parcial | Completar adjuntos válidos y aislar el fallido |

Cada excepción incluirá estado, motivo, origen, fecha, responsable cuando proceda y acción de reproceso. No habrá pérdida silenciosa de correos o adjuntos.

## 11. Consultas Copilot

Ejemplos: “¿Cuándo tengo que pagar al proveedor X?”, “¿Qué facturas vencen esta semana?”, “¿Cuánto vence este mes?” o “¿A quién debo pagar en los próximos 15 días?”.

Las respuestas deberán aplicar filtros sobre datos autorizados, mostrar moneda y periodo, distinguir registros sin vencimiento, aportar detalle o enlaces verificables, y no inferir pagos. Antes de aceptar se preparará un conjunto de preguntas con resultados calculados manualmente.

## 12. Requisitos no funcionales

- **Seguridad:** mínimo privilegio, conexiones administradas, sin secretos embebidos y respeto de permisos en Copilot.
- **Fiabilidad:** idempotencia ante reintentos, correlación entre componentes y reintentos limitados para fallos transitorios.
- **Trazabilidad:** reconstrucción completa desde el correo hasta el PDF y el registro.
- **Configuración:** buzón, rutas, patrón, umbrales y notificaciones modificables sin rediseño.
- **Operación:** registro de volumen, tiempos, errores y consumo de AI Builder.
- **Mantenibilidad:** propietarios, conexiones, dependencias y soporte documentados.
- **Escalabilidad:** dimensionamiento tras confirmar volumen y control de concurrencia en Excel.
- **Privacidad:** retención y tratamiento conforme a las políticas del tenant.

## 13. Criterios de aceptación

| ID | Escenario verificable |
|---|---|
| CA-01 | Una factura válida se clasifica, extrae, renombra, archiva y registra una sola vez con enlace funcional. |
| CA-02 | Un correo sin factura no provoca consumo de extracción de factura. |
| CA-03 | Varias facturas adjuntas producen resultados independientes y trazables. |
| CA-04 | Un presupuesto u otro documento no se registra como factura. |
| CA-05 | Una factura incompleta crea una excepción visible y no figura como completada. |
| CA-06 | Una segunda recepción de la misma factura se marca como posible duplicado. |
| CA-07 | Un fallo de SharePoint o Excel puede reintentarse sin duplicar resultados. |
| CA-08 | Desde Excel se abre el PDF y se puede identificar correo y ejecución de origen. |
| CA-09 | Copilot devuelve importe y vencimiento correctos de una factura conocida con su fuente. |
| CA-10 | Copilot suma correctamente un periodo y muestra los registros incluidos. |
| CA-11 | Copilot no presenta facturas como pagadas ni utiliza datos bancarios. |
| CA-12 | Un usuario sin permisos no puede consultar ni abrir información restringida. |

La aceptación se ejecutará en el tenant objetivo con facturas representativas, anonimizadas o autorizadas.

## 14. Dependencias y riesgos

| Riesgo/dependencia | Mitigación |
|---|---|
| Licencias/capacidad de AI Builder sin confirmar | Revisar tenant y modalidad de consumo antes del diseño final |
| Calidad y variedad documental | Piloto representativo, confianza y revisión humana |
| Concurrencia y límites de Excel | Medir volumen, controlar escrituras y evaluar alternativa si procede |
| Nomenclatura pendiente | Configuración provisional solo en desarrollo |
| Duplicados sin regla | Validar clave con contabilidad y no eliminar automáticamente |
| Permisos incorrectos | Matriz de acceso y pruebas por rol |
| Respuestas Copilot inexactas | Grounding, evidencia y conjunto de evaluación |
| Cambio de columnas Excel | Gobierno de esquema y control de cambios |

## 15. Decisiones pendientes del cliente

| ID | Confirmación requerida |
|---|---|
| DP-01 | Buzón, carpeta y reglas de entrada |
| DP-02 | Formatos, escaneados, tamaño máximo y adjuntos incrustados |
| DP-03 | Destino de presupuestos y otros documentos |
| DP-04 | Patrón exacto de nombre y conducta si falta un dato |
| DP-05 | Sitio, biblioteca, carpetas, metadatos, retención y permisos |
| DP-06 | Ubicación y columnas de Excel, propietarios y edición manual |
| DP-07 | Campos definitivos y obligatoriedad de vencimiento/moneda |
| DP-08 | Regla cuando no exista fecha de vencimiento |
| DP-09 | Clave de duplicidad, tolerancias y resolución |
| DP-10 | Umbrales de confianza y campos sujetos a revisión |
| DP-11 | Responsables, canal y plazo de atención de excepciones |
| DP-12 | Preguntas prioritarias y formato de respuesta de Copilot |
| DP-13 | Licencias de M365, Copilot, Power Automate y AI Builder |
| DP-14 | Volumen medio, máximo, estacionalidad e histórico |
| DP-15 | Idiomas, monedas y tratamiento multimoneda |

## 16. Arquitectura conceptual

| Componente | Responsabilidad |
|---|---|
| Outlook / Exchange Online | Correo y adjuntos |
| Power Automate | Orquestación, clasificación, validación, archivo y excepciones |
| AI Builder | Extracción bajo demanda |
| SharePoint | Repositorio y permisos |
| Excel Online | Registro operativo de Fase 1 |
| Copilot / agente | Consultas y previsiones por vencimiento |

La distribución definitiva se cerrará al validar licencias, conectores, permisos y experiencia de usuario. El PRD no presupone una modalidad de pago concreta.

## 17. Entregables

- Flujos o agentes desplegados en el entorno acordado.
- Biblioteca SharePoint y Excel estructurado.
- Extracción AI Builder configurada y probada.
- Circuito de excepciones y reproceso.
- Experiencia de consulta Copilot.
- Matriz de permisos y conexiones.
- Evidencia de pruebas y aceptación.
- Documentación de operación, soporte y configuración.

## 18. Backlog inicial

| Épica | Resultado |
|---|---|
| E1. Descubrimiento | Cerrar DP-01 a DP-15 y licencias |
| E2. Ingesta | Detectar correos y conservar metadatos |
| E3. Clasificación | Separar factura, presupuesto y otros |
| E4. Extracción | AI Builder, campos, confianza y consumo |
| E5. Documento | Validar, renombrar y guardar |
| E6. Registro | Excel, idempotencia y vínculo |
| E7. Excepciones | Estados, avisos, corrección y reproceso |
| E8. Copilot | Consultas, grounding y evaluación |
| E9. Calidad | Pruebas funcionales, seguridad y concurrencia |
| E10. Operación | Monitorización, formación y producción |

## 19. Definición de terminado

La Fase 1 estará terminada cuando las decisiones bloqueantes estén aprobadas; CA-01 a CA-12 estén documentados como superados; el circuito funcione con documentos representativos; las excepciones sean visibles y reprocesables; permisos, conexiones y propietarios estén documentados; puedan revisarse consumo y métricas; y el cliente acepte formalmente la solución. No se incorporará conciliación bancaria ni inferencia de pagos reales.

## 20. Aprobación

| Revisión | Estado |
|---|---|
| El alcance refleja correctamente el requerimiento | ☐ Pendiente |
| Existen cambios o aclaraciones por incorporar | ☐ Pendiente |
| Responsable del cliente |  |
| Fecha |  |
| Comentarios |  |
