# PRD — Automatización de facturas y conciliación bancaria con Microsoft 365 y Copilot

```yaml
estado: pendiente-de-validación-cliente
versión: 3.0
fecha: 2026-09-08
fuente: PRD_Automatizacion_Facturas_M365_Copilot_v2.md y ampliación de alcance comunicada por gerencia
fase: 1
alcance: recepción, clasificación, extracción, archivo, registro, consulta y conciliación bancaria
excluido: conexión directa con bancos, ejecución de pagos y contabilización automática en ERP
```

> Especificación funcional para validar el alcance antes de la implantación. Las decisiones marcadas como **Pendiente** deben cerrarse con el cliente antes de producción.

## 1. Resumen ejecutivo

El proyecto automatizará la gestión de facturas recibidas por correo dentro de Microsoft 365. El sistema clasificará los documentos antes de consumir AI Builder, procesará bajo demanda únicamente las facturas, extraerá sus datos, renombrará y archivará los PDF en SharePoint, registrará la información, permitirá consultas mediante Copilot y conciliará las facturas pendientes contra movimientos importados desde extractos bancarios.

```text
Correo → clasificación ──→ presupuesto/otro → derivación por definir
              ↓ factura
       AI Builder bajo demanda
              ↓
      validación y duplicados ──→ excepción/revisión manual
              ↓
 SharePoint + registro maestro → consultas Copilot
              ↑
 Extracto bancario → validación → normalización → motor de conciliación
                                                   ↓
                              coincidencia / revisión / sin coincidencia
```

La solución permitirá confirmar pagos a partir de coincidencias bancarias aceptadas y trazables. No se conectará directamente a entidades bancarias, no iniciará transferencias ni órdenes de pago y no contabilizará automáticamente en un ERP.

## 2. Problema

El proceso actual requiere descargar, clasificar, renombrar, archivar y registrar facturas manualmente. Obtener previsiones de vencimiento y comprobar posteriormente los pagos contra extractos bancarios también exige revisión manual. Esto consume tiempo y aumenta el riesgo de pérdida documental, duplicidad, errores de transcripción y asociaciones incorrectas entre facturas y movimientos.

## 3. Objetivos

- Reducir el tratamiento manual de las facturas.
- Centralizar los PDF en SharePoint con acceso controlado.
- Mantener trazabilidad entre correo, documento, registro y movimiento bancario.
- Extraer de forma consistente los datos necesarios.
- Consumir AI Builder solo al procesar una factura.
- Consultar proveedores, importes, vencimientos, pendientes y pagos conciliados en lenguaje natural.
- Importar extractos bancarios con un esquema controlado y sin conexión directa al banco.
- Proponer coincidencias mediante reglas explicables y configurables.
- Separar coincidencias seguras de casos que requieren revisión humana.
- Derivar a revisión cualquier caso incompleto, incoherente, ambiguo o de baja confianza.

Durante el piloto se medirá: porcentaje de facturas sin intervención, exactitud de campos obligatorios, tiempo de proceso, excepciones por causa, consumo de AI Builder, exactitud de consultas Copilot, porcentaje de movimientos conciliados automáticamente, falsos positivos y volumen de revisión manual. Las metas se fijarán tras confirmar volumen y calidad de los documentos reales.

## 4. Usuarios

| Rol | Necesidad | Acceso esperado |
|---|---|---|
| Administración | Supervisión, excepciones y reproceso | Lectura/escritura operativa |
| Contabilidad | PDF, registro, importaciones y revisión de conciliaciones | Lectura documental y edición autorizada |
| Dirección / gestión | Vencimientos, pendientes, pagos e importes | Lectura y consultas Copilot |
| Administrador M365 | Recursos, conexiones, permisos y consumo | Administración técnica |

Se aplicará mínimo privilegio. SharePoint, el registro maestro, los extractos y Copilot deberán respetar la identidad y permisos del usuario. El acceso a información bancaria se limitará a los roles autorizados.

## 5. Alcance

### Incluido

- Detección de correo en el buzón o carpeta acordada.
- Lectura independiente de uno o varios adjuntos.
- Clasificación inicial en factura, presupuesto u otro.
- Extracción de facturas con AI Builder bajo demanda.
- Validaciones de integridad, coherencia y duplicidad.
- Renombrado configurable y almacenamiento en SharePoint.
- Alta controlada en un registro maestro con enlace al PDF.
- Consultas y previsiones mediante Copilot.
- Carga manual de extractos bancarios Excel con formato acordado.
- Validación, normalización e importación idempotente de movimientos por lotes.
- Conciliación por reglas configurables y puntuación explicable.
- Confirmación automática opcional de coincidencias de alta confianza, si el cliente la aprueba.
- Confirmación o rechazo manual de coincidencias probables o ambiguas.
- Actualización trazable del estado, fecha de pago y referencia bancaria.
- Excepciones, revisión manual, auditoría y reproceso.

### Fuera de alcance

- Conexión directa por API, open banking o acceso automatizado a bancos.
- Transferencias, órdenes de pago o cualquier operación sobre cuentas bancarias.
- Contabilización automática en ERP.
- Aprobaciones de gasto multinivel.
- Tratamiento completo de presupuestos u otros documentos; solo se clasifican y derivan.
- Facturas emitidas y ciclo completo de cuentas a cobrar.
- Conciliación contable de partidas distintas de las facturas recibidas incluidas en este circuito.

## 6. Flujos funcionales

### 6.1 Recepción y registro de facturas

1. Power Automate detecta un correo nuevo y conserva identificador, remitente, asunto y fecha.
2. Enumera los adjuntos y procesa cada uno como unidad independiente.
3. Valida el archivo y lo clasifica antes de invocar extracción documental.
4. Si no es factura, lo deriva según una regla pendiente de confirmar.
5. Si es factura, AI Builder extrae los campos acordados bajo demanda.
6. Se validan campos obligatorios, importes, confianza y posibles duplicados.
7. Un resultado dudoso se conserva y genera una excepción revisable.
8. Un resultado válido genera el nombre configurado y se guarda en SharePoint.
9. Se crea un registro único con los datos, metadatos y enlace al PDF.
10. La ejecución queda marcada como completada de forma idempotente.

Un fallo en un adjunto no impedirá procesar los restantes adjuntos válidos del correo.

### 6.2 Importación bancaria

1. Un usuario autorizado carga un Excel bancario en la ubicación acordada.
2. El sistema identifica el archivo y crea un lote de importación único.
3. Valida versión de esquema, cabeceras, tipos, filas, moneda y convención de signo.
4. Normaliza fechas, importes, conceptos y referencias sin alterar el archivo original.
5. Detecta movimientos repetidos dentro del lote y en importaciones anteriores.
6. Si el lote contiene errores bloqueantes, no concilia y genera un informe accionable.
7. Si es válido, conserva los movimientos normalizados y registra el resultado del lote.

### 6.3 Conciliación

1. Cada movimiento elegible se compara con facturas pendientes compatibles.
2. El motor calcula una puntuación por importe, moneda, proveedor o referencia y proximidad temporal.
3. El resultado se clasifica como `Alta`, `Probable`, `Revisar` o `Sin coincidencia`.
4. Una coincidencia `Alta` solo podrá aceptarse automáticamente cuando la regla y el umbral hayan sido aprobados.
5. Una coincidencia `Probable`, múltiples candidatas o cualquier ambigüedad requieren revisión humana.
6. Al aceptar una coincidencia se vinculan factura, movimiento y lote, y se guardan estado, fecha de pago, referencia, puntuación y modo de aceptación.
7. Al rechazarla se conserva la decisión y se permite evaluar otros candidatos sin perder trazabilidad.
8. Reprocesar un lote o movimiento no creará relaciones ni actualizaciones duplicadas.

### 6.4 Consultas

Copilot responderá consultas sobre facturas, vencimientos, pendientes y conciliaciones utilizando únicamente datos autorizados y relaciones confirmadas. Distinguirá claramente entre previsión, propuesta de coincidencia y pago conciliado.

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
| RF-11 | Crear un registro único y enlazarlo con el PDF. | Must |
| RF-12 | Relacionar mensaje, adjunto, ejecución, PDF y registro. | Must |
| RF-13 | Consultar facturas por proveedor, número, fechas, estado e importe con Copilot. | Must |
| RF-14 | Agregar importes por fecha o periodo e identificar los registros del cálculo. | Must |
| RF-15 | Crear una excepción accionable por baja confianza, incoherencia o fallo técnico. | Must |
| RF-16 | Corregir y reprocesar sin duplicar PDF ni registro. | Should |
| RF-17 | Notificar excepciones a los responsables definidos. | Should |
| RF-18 | Registrar resultado, errores y consumo para soporte. | Should |
| RF-19 | Aceptar un Excel bancario con esquema y ubicación configurados. | Must |
| RF-20 | Validar cabeceras, tipos, filas, moneda y convención de signo antes de conciliar. | Must |
| RF-21 | Crear lotes trazables y evitar la importación duplicada de archivos o movimientos. | Must |
| RF-22 | Normalizar fechas, importes, conceptos y referencias conservando el valor original. | Must |
| RF-23 | Comparar movimientos con facturas pendientes mediante reglas configurables. | Must |
| RF-24 | Puntuar y explicar coincidencias por importe, moneda, referencia/proveedor y fecha. | Must |
| RF-25 | Clasificar resultados como `Alta`, `Probable`, `Revisar` o `Sin coincidencia`. | Must |
| RF-26 | No auto-conciliar cuando existan varios candidatos ambiguos. | Must |
| RF-27 | Permitir confirmar o rechazar manualmente una propuesta y auditar la decisión. | Must |
| RF-28 | Al aceptar, vincular factura y movimiento y actualizar estado, fecha y referencia de pago. | Must |
| RF-29 | Contemplar pagos parciales, agrupados, anticipos, abonos y comisiones según reglas aprobadas. | Should |
| RF-30 | Consultar conciliaciones y pagos confirmados con fuentes verificables y permisos. | Should |

### Reglas de negocio

- La clasificación siempre precede a la extracción.
- Una factura solo estará procesada cuando PDF y registro queden relacionados.
- Una fecha ausente no se inventará: se aplicará una regla aprobada o se revisará.
- Los importes serán numéricos y la moneda se guardará por separado.
- Un posible duplicado no se eliminará automáticamente.
- `Pagada` y `Conciliada` no son equivalentes: `Conciliada` requiere una coincidencia bancaria aceptada.
- Ninguna propuesta ambigua se aceptará automáticamente.
- No se conciliarán importes en monedas distintas sin una regla de conversión aprobada.
- Los pagos parciales o agrupados no se resolverán como coincidencia simple salvo regla explícita.
- Cada decisión automática o manual conservará puntuación, motivos, usuario/origen y fecha.
- Copilot mostrará el periodo y los registros fuente de cada agregación.
- Copilot no presentará una propuesta sin confirmar como pago realizado.

## 8. Modelo de datos

### 8.1 Factura

| Campo | Tipo recomendado | Obligatorio | Fuente |
|---|---|---:|---|
| FacturaId | GUID/texto | Sí | Sistema |
| ProveedorNombre | Texto | Sí | Factura |
| ProveedorIdFiscal | Texto | Pendiente | Factura |
| NumeroFactura | Texto | Sí | Factura |
| FechaFactura | Fecha | Sí | Factura |
| FechaVencimiento | Fecha | Pendiente | Factura/regla |
| BaseImponible | Decimal | Sí | Factura |
| ImporteIVA | Decimal | Sí | Factura |
| TotalFactura | Decimal | Sí | Factura |
| Moneda | ISO 4217 | Pendiente | Factura/regla |
| EstadoProceso | Opción | Sí | Sistema |
| EstadoPago | Opción | Sí | Sistema/conciliación |
| FechaPago | Fecha | No | Conciliación |
| MovimientoBancoId | GUID/texto | No | Conciliación |
| EnlacePDF | URL | Sí | SharePoint |

Metadatos operativos recomendados: `MessageId`, `RemitenteCorreo`, `FechaRecepcion`, `NombreArchivoOriginal`, `NombreArchivoFinal`, `SharePointItemId`, `ClaveDuplicado`, `ConfianzaExtraccion`, `MotivoRevision`, `FechaProcesado` y `FlowRunId`.

Campos candidatos pendientes: concepto, centro de coste, pedido, proyecto, categoría contable y condiciones de pago.

### 8.2 Movimiento bancario

| Campo | Tipo recomendado | Obligatorio | Fuente |
|---|---|---:|---|
| MovimientoBancoId | GUID/texto | Sí | Sistema |
| LoteImportacionId | GUID/texto | Sí | Sistema |
| IdentificadorOrigen | Texto | Pendiente | Extracto |
| FechaMovimiento | Fecha | Sí | Extracto |
| FechaValor | Fecha | No | Extracto |
| ConceptoOriginal | Texto | Sí | Extracto |
| ConceptoNormalizado | Texto | No | Sistema |
| Importe | Decimal | Sí | Extracto |
| Moneda | ISO 4217 | Sí | Extracto/regla |
| Referencia | Texto | No | Extracto |
| Contraparte | Texto | No | Extracto |
| FacturaId | GUID/texto | No | Conciliación |
| ResultadoConciliacion | Opción | Sí | Sistema |
| PuntuacionConciliacion | Decimal | No | Sistema |
| MotivosPuntuacion | Texto/JSON | No | Sistema |

### 8.3 Lote de importación

| Campo | Tipo recomendado | Obligatorio |
|---|---|---:|
| LoteImportacionId | GUID/texto | Sí |
| NombreArchivo | Texto | Sí |
| HashArchivo | Texto | Sí |
| FechaImportacion | Fecha/hora | Sí |
| UsuarioImportacion | Texto | Sí |
| VersionEsquema | Texto | Sí |
| EstadoLote | Opción | Sí |
| FilasTotales | Entero | Sí |
| FilasValidas | Entero | Sí |
| FilasRechazadas | Entero | Sí |
| MotivoError | Texto | No |

### 8.4 Conciliación

| Campo | Tipo recomendado | Obligatorio |
|---|---|---:|
| ConciliacionId | GUID/texto | Sí |
| FacturaId | GUID/texto | Sí |
| MovimientoBancoId | GUID/texto | Sí |
| Resultado | Opción | Sí |
| Puntuacion | Decimal | Sí |
| Motivos | Texto/JSON | Sí |
| EstadoDecision | Opción | Sí |
| ModoAceptacion | Automática/Manual | No |
| DecididoPor | Texto | No |
| FechaDecision | Fecha/hora | No |
| ImporteAplicado | Decimal | Sí |

El registro se implementará inicialmente con las fuentes Microsoft 365 acordadas. Se validarán volumen, relaciones y concurrencia: si Excel no ofrece robustez suficiente para movimientos y conciliaciones, se utilizará SharePoint Lists o Dataverse previa validación de licencias y aprobación del cliente. No se usarán celdas combinadas ni columnas variables como registro maestro.

## 9. Nomenclatura y SharePoint

El patrón exacto será configuración proporcionada por el cliente. Ejemplo no vinculante:

```text
{FechaFactura:yyyy-MM-dd}_{Proveedor}_{NumeroFactura}_{Total}_{Moneda}.pdf
```

El sistema reemplazará caracteres incompatibles, limitará longitud, conservará la extensión, evitará sobrescrituras y registrará nombre original y final. La biblioteca, carpetas, metadatos, retención y versionado están pendientes.

Los extractos originales se almacenarán en una ubicación separada y restringida, organizados por lote, sin sobrescritura y con su hash. Los registros normalizados no sustituirán al archivo fuente.

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
| EX-08 | Error de SharePoint | Reintentar sin crear registro huérfano |
| EX-09 | Error del registro | Reintentar sin duplicar el documento |
| EX-10 | Fallo parcial | Completar adjuntos válidos y aislar el fallido |
| EX-11 | Esquema bancario no válido | Rechazar el lote antes de conciliar e informar filas/columnas |
| EX-12 | Extracto o movimiento duplicado | Omitir duplicación y relacionar con la importación previa |
| EX-13 | Moneda o signo no interpretable | No conciliar y solicitar corrección |
| EX-14 | Coincidencia con varias candidatas | Enviar a revisión sin aceptación automática |
| EX-15 | Pago parcial, agrupado, anticipo o abono no resoluble | Enviar a revisión con candidatos y motivos |
| EX-16 | Error durante conciliación | Reintentar sin duplicar relaciones ni estados |

Cada excepción incluirá estado, motivo, origen, fecha, responsable cuando proceda y acción de reproceso. No habrá pérdida silenciosa de correos, adjuntos, lotes o movimientos.

## 11. Consultas Copilot

Ejemplos: “¿Cuándo tengo que pagar al proveedor X?”, “¿Qué facturas vencen esta semana?”, “¿Cuánto vence este mes?”, “¿Qué facturas siguen pendientes?”, “¿Qué pagos se conciliaron esta semana?” o “¿Qué movimientos necesitan revisión?”.

Las respuestas deberán aplicar filtros sobre datos autorizados, mostrar moneda y periodo, distinguir registros sin vencimiento, aportar detalle o enlaces verificables y diferenciar:

- previsiones calculadas a partir del vencimiento;
- propuestas de conciliación todavía no confirmadas;
- pagos asociados a conciliaciones aceptadas.

Antes de aceptar se preparará un conjunto de preguntas con resultados calculados manualmente. La información bancaria solo será accesible para usuarios autorizados.

## 12. Requisitos no funcionales

- **Seguridad:** mínimo privilegio, conexiones administradas, sin secretos embebidos y respeto de permisos en Copilot.
- **Fiabilidad:** idempotencia ante reintentos, correlación entre componentes y reintentos limitados para fallos transitorios.
- **Trazabilidad:** reconstrucción completa desde el correo hasta el PDF, registro, lote, movimiento y decisión.
- **Explicabilidad:** toda propuesta indicará puntuación, reglas aplicadas y factores de coincidencia.
- **Configuración:** buzón, rutas, patrones, esquemas, tolerancias, umbrales y notificaciones modificables sin rediseño.
- **Operación:** registro de volumen, tiempos, errores, consumo y métricas de conciliación.
- **Mantenibilidad:** propietarios, conexiones, dependencias y soporte documentados.
- **Escalabilidad:** dimensionamiento tras confirmar volumen y control de concurrencia en el repositorio elegido.
- **Privacidad:** retención y tratamiento de datos financieros conforme a las políticas del tenant.
- **Integridad:** importes originales, decisiones y vínculos aceptados no se modificarán sin auditoría.

## 13. Criterios de aceptación

| ID | Escenario verificable |
|---|---|
| CA-01 | Una factura válida se clasifica, extrae, renombra, archiva y registra una sola vez con enlace funcional. |
| CA-02 | Un correo sin factura no provoca consumo de extracción de factura. |
| CA-03 | Varias facturas adjuntas producen resultados independientes y trazables. |
| CA-04 | Un presupuesto u otro documento no se registra como factura. |
| CA-05 | Una factura incompleta crea una excepción visible y no figura como completada. |
| CA-06 | Una segunda recepción de la misma factura se marca como posible duplicado. |
| CA-07 | Un fallo de SharePoint o del registro puede reintentarse sin duplicar resultados. |
| CA-08 | Desde el registro se abre el PDF y se identifica correo y ejecución de origen. |
| CA-09 | Copilot devuelve importe y vencimiento correctos de una factura conocida con su fuente. |
| CA-10 | Copilot suma correctamente un periodo y muestra los registros incluidos. |
| CA-11 | Copilot distingue previsiones, propuestas y pagos conciliados sin inferir estados. |
| CA-12 | Un usuario sin permisos no puede consultar ni abrir información restringida. |
| CA-13 | Un extracto válido crea un lote y movimientos normalizados conservando el archivo original. |
| CA-14 | Un extracto con cabeceras o tipos inesperados se rechaza con errores accionables y no concilia. |
| CA-15 | Reimportar el mismo extracto no duplica lotes, movimientos ni conciliaciones. |
| CA-16 | Un pago exacto en moneda compatible produce una coincidencia alta y explicable. |
| CA-17 | Un movimiento con dos facturas candidatas no se acepta automáticamente y pasa a revisión. |
| CA-18 | Confirmar una propuesta vincula factura y movimiento y registra usuario, fecha y referencia. |
| CA-19 | Rechazar una propuesta conserva la auditoría y no marca la factura como conciliada. |
| CA-20 | Pagos parciales, agrupados, anticipos y abonos siguen la regla aprobada o pasan a revisión. |
| CA-21 | Copilot responde sobre conciliaciones confirmadas con registros fuente verificables. |

La aceptación se ejecutará en el tenant objetivo con facturas y extractos representativos, anonimizados o autorizados.

## 14. Dependencias y riesgos

| Riesgo/dependencia | Mitigación |
|---|---|
| Licencias/capacidad de AI Builder sin confirmar | Revisar tenant y modalidad de consumo antes del diseño final |
| Calidad y variedad documental | Piloto representativo, confianza y revisión humana |
| Concurrencia y límites de Excel | Medir volumen y relaciones; usar SharePoint Lists o Dataverse si procede |
| Nomenclatura pendiente | Configuración provisional solo en desarrollo |
| Duplicados sin regla | Validar clave con contabilidad y no eliminar automáticamente |
| Permisos incorrectos | Matriz de acceso y pruebas por rol |
| Respuestas Copilot inexactas | Grounding, evidencia y conjunto de evaluación |
| Cambio de columnas Excel | Versionar esquema y rechazar archivos incompatibles de forma controlada |
| Extractos diferentes por banco | Adaptadores de importación por esquema/versiones configurables |
| Falsos positivos de conciliación | Umbrales conservadores, explicabilidad y revisión humana |
| Pagos parciales o agrupados | Modelar importes aplicados y no forzar relaciones uno a uno |
| Datos bancarios sensibles | Ubicación restringida, mínimo privilegio, auditoría y retención acordada |

## 15. Decisiones pendientes del cliente

| ID | Confirmación requerida |
|---|---|
| DP-01 | Buzón, carpeta y reglas de entrada |
| DP-02 | Formatos, escaneados, tamaño máximo y adjuntos incrustados |
| DP-03 | Destino de presupuestos y otros documentos |
| DP-04 | Patrón exacto de nombre y conducta si falta un dato |
| DP-05 | Sitio, biblioteca, carpetas, metadatos, retención y permisos |
| DP-06 | Repositorio maestro, columnas, propietarios y edición manual |
| DP-07 | Campos definitivos y obligatoriedad de vencimiento/moneda |
| DP-08 | Regla cuando no exista fecha de vencimiento |
| DP-09 | Clave de duplicidad, tolerancias y resolución |
| DP-10 | Umbrales de confianza y campos sujetos a revisión |
| DP-11 | Responsables, canal y plazo de atención de excepciones |
| DP-12 | Preguntas prioritarias y formato de respuesta de Copilot |
| DP-13 | Licencias de M365, Copilot, Power Automate y AI Builder/Copilot Credits |
| DP-14 | Volumen medio, máximo, estacionalidad e histórico de facturas y movimientos |
| DP-15 | Idiomas, monedas y tratamiento multimoneda |
| DP-16 | Bancos incluidos, formato de cada extracto y muestra anonimizada |
| DP-17 | Ubicación de carga, responsables y periodicidad de importación bancaria |
| DP-18 | Fecha aplicable: contable, operación o valor |
| DP-19 | Convención de signos, moneda por defecto y tratamiento de comisiones |
| DP-20 | Reglas para pagos parciales, agrupados, anticipos, abonos y notas de crédito |
| DP-21 | Pesos, tolerancias y umbrales de clasificación de coincidencias |
| DP-22 | Autorización o prohibición de aceptación automática para confianza alta |
| DP-23 | Responsables y procedimiento para confirmar o rechazar propuestas |
| DP-24 | Retención, acceso y protección específica de extractos y datos bancarios |

## 16. Arquitectura conceptual

| Componente | Responsabilidad |
|---|---|
| Outlook / Exchange Online | Correo y adjuntos |
| Power Automate | Orquestación, clasificación, importación, archivo y excepciones |
| AI Builder | Extracción de facturas bajo demanda |
| Azure Function | Validación, reglas, idempotencia, normalización y motor de conciliación |
| SharePoint | Repositorio de PDF y extractos, permisos y metadatos |
| Excel Online | Entrada bancaria y/o vista operativa según volumen validado |
| SharePoint Lists / Dataverse | Candidato a registro relacional de facturas, lotes, movimientos y conciliaciones |
| Copilot / agente | Consultas, previsiones y conciliaciones confirmadas |

La distribución definitiva se cerrará al validar licencias, conectores, permisos, volumen, concurrencia y experiencia de usuario. El PRD no presupone una modalidad de pago concreta. La conciliación no dependerá de capacidades generativas: sus decisiones se basarán en reglas deterministas, parametrizadas y auditables.

## 17. Entregables

- Flujos o agentes desplegados en el entorno acordado.
- Biblioteca SharePoint y registro estructurado.
- Extracción AI Builder configurada y probada.
- Plantilla y esquema versionado del extracto bancario.
- Importador, validador y normalizador de movimientos.
- Motor de conciliación con puntuación explicable y parámetros documentados.
- Vista o cola de revisión de coincidencias.
- Circuito de excepciones y reproceso.
- Experiencia de consulta Copilot.
- Matriz de permisos y conexiones.
- Evidencia de pruebas y aceptación, incluidas las conciliaciones.
- Documentación de operación, soporte y configuración.

## 18. Backlog inicial

| Épica | Resultado |
|---|---|
| E1. Descubrimiento | Cerrar DP-01 a DP-24 y licencias |
| E2. Ingesta | Detectar correos y conservar metadatos |
| E3. Clasificación | Separar factura, presupuesto y otros |
| E4. Extracción | AI Builder, campos, confianza y consumo |
| E5. Documento | Validar, renombrar y guardar |
| E6. Registro | Registro maestro, idempotencia y vínculo |
| E7. Excepciones | Estados, avisos, corrección y reproceso |
| E8. Banco | Esquema, carga, lotes, validación y normalización |
| E9. Conciliación | Reglas, puntuación, revisión y actualización de estados |
| E10. Copilot | Consultas, grounding y evaluación |
| E11. Calidad | Pruebas funcionales, seguridad, concurrencia y falsos positivos |
| E12. Operación | Monitorización, formación y producción |

## 19. Definición de terminado

La Fase 1 estará terminada cuando:

- las decisiones bloqueantes estén aprobadas;
- CA-01 a CA-21 estén documentados como superados o exista una excepción formalmente aceptada;
- el circuito de facturas funcione con documentos representativos;
- la importación y conciliación funcionen con extractos representativos;
- las coincidencias ambiguas nunca se acepten automáticamente;
- las excepciones sean visibles y reprocesables;
- permisos, conexiones y propietarios estén documentados;
- puedan revisarse consumo, precisión, falsos positivos y métricas operativas;
- el cliente acepte formalmente la solución.

La definición de terminado no incluye conexión directa con bancos, ejecución de pagos ni contabilización automática en ERP.

## 20. Aprobación

| Revisión | Estado |
|---|---|
| El alcance refleja correctamente el requerimiento | ☐ Pendiente |
| La conciliación bancaria mediante extracto está correctamente definida | ☐ Pendiente |
| Existen cambios o aclaraciones por incorporar | ☐ Pendiente |
| Responsable del cliente |  |
| Fecha |  |
| Comentarios |  |

## 21. Control de cambios

| Versión | Fecha | Cambio |
|---|---|---|
| 2.0 | 2026-09-07 | Alcance de recepción, extracción, archivo, registro y consulta; conciliación excluida. |
| 3.0 | 2026-09-08 | Conciliación bancaria incorporada a Fase 1 por indicación de gerencia; añadidos importación, modelo de datos, reglas, excepciones, aceptación y decisiones pendientes. |
