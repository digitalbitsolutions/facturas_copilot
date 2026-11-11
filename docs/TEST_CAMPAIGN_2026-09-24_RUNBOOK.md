# Manual de prueba desde cero — campaña de tres facturas

Fecha de inicio: 24 de septiembre de 2026
Entorno: `dev` / buzón `facturas-pruebas@integramente.onmicrosoft.com`

## Objetivo y alcance

Comprobar el recorrido completo de tres facturas nuevas e independientes:

```text
Correo con un PDF
  → buzón de pruebas / Inbox
  → Azure Function (cada 10 minutos)
  → clasificación, extracción y validación del proveedor
  → ProcesosFacturas y RegistroFacturas
  → Documentos/Facturas/<PROVEEDOR>/
  → ConsultaPagosCopilot
```

Se enviarán **tres correos distintos**, cada uno con **un único PDF**: ENDESA, EMAS y SATINFO. Esta prueba no carga previsiones, extractos ni pagos; el estado inicial esperado en la proyección es `Pendiente`.

## Enlaces operativos

| Uso | Enlace |
|---|---|
| Enviar el correo | [Outlook en la web](https://outlook.office.com/mail/) |
| Comprobar la llegada al buzón vigilado | [Inbox de facturas-pruebas](https://outlook.office.com/mail/facturas-pruebas@integramente.onmicrosoft.com/inbox) |
| Sitio de archivos y listas | [SharePoint — Facturas](https://integramente.sharepoint.com/sites/facturas) |
| Estado técnico de cada adjunto | [ProcesosFacturas](https://integramente.sharepoint.com/sites/facturas/Lists/ProcesosFacturas/AllItems.aspx) |
| Registro fiscal de facturas completadas | [RegistroFacturas](https://integramente.sharepoint.com/sites/facturas/Lists/RegistroFacturas/AllItems.aspx) |
| Incidencias que requieren intervención | [Excepciones](https://integramente.sharepoint.com/sites/facturas/Lists/Excepciones/AllItems.aspx) |
| PDF archivados | [Documentos / Facturas](https://integramente.sharepoint.com/sites/facturas/Shared%20Documents/Forms/AllItems.aspx?id=%2Fsites%2Ffacturas%2FShared%20Documents%2FFacturas) |
| Resultado disponible para el agente | [ConsultaPagosCopilot](https://integramente.sharepoint.com/sites/facturas/Lists/ConsultaPagosCopilot/AllItems.aspx) |
| Diagnóstico técnico | [Azure Portal](https://portal.azure.com/) → `func-facturas-copilot-dev-jbhyjbgfzr3iy` → **Monitoring** → **Logs** |

Referencias: [runbook del buzón](./MAILBOX_PILOT_RUNBOOK.md), [matriz de aceptación](./ACCEPTANCE_MATRIX.md) y [configuración del agente de pagos](./COPILOT_PAYMENT_AGENT.md).

## Condiciones antes de empezar

1. La campaña fue limpiada el 24/09/2026 y la Function está activa. No modificar ajustes de Azure, listas ni el maestro de proveedores durante la prueba.
2. Cada PDF debe ser una factura nueva, legible, sin contraseña y no enviada anteriormente al buzón. No reutilizar números de pruebas previas.
3. Para cada envío, usar un correo nuevo dirigido a `facturas-pruebas@integramente.onmicrosoft.com`, con un solo PDF adjunto normal (no insertado en el cuerpo). Anotar hora local, asunto y nombre del archivo.
4. No reenviar ni eliminar el correo tras enviarlo: el proceso lee el buzón, pero no mueve ni marca mensajes.
5. Esperar hasta 12 minutos por cada comprobación. El sondeo ocurre cada diez minutos, en el segundo 30; los registros técnicos se muestran en UTC.

## Secuencia guiada

Realizar los envíos uno por uno y cerrar la verificación de cada proveedor antes de continuar. Así cualquier incidencia queda atribuida a un único PDF.

| Orden | Acción | Evidencia que anotar |
|---:|---|---|
| 0 | Confirmar que `ProcesosFacturas`, `RegistroFacturas`, `Excepciones`, `Documentos/Facturas` y `ConsultaPagosCopilot` están vacíos. | Hora local de la comprobación. |
| 1 | Enviar la factura de **ENDESA**. | Hora, asunto, adjunto y número de factura. |
| 2 | Abrir el [Inbox de facturas-pruebas](https://outlook.office.com/mail/facturas-pruebas@integramente.onmicrosoft.com/inbox) y confirmar que el mensaje de ENDESA llegó con un único PDF adjunto. | Hora de llegada visible en Outlook. |
| 3 | Esperar al sondeo y verificar ENDESA. | Estado, `ProcessId`, archivo y número registrado. |
| 4 | Enviar la factura de **EMAS** y confirmar inmediatamente su llegada en el [Inbox de facturas-pruebas](https://outlook.office.com/mail/facturas-pruebas@integramente.onmicrosoft.com/inbox). | Hora, asunto, adjunto y número de factura. |
| 5 | Esperar al sondeo y verificar EMAS. | Estado, `ProcessId`, archivo y número registrado. |
| 6 | Enviar la factura de **SATINFO** y confirmar inmediatamente su llegada en el [Inbox de facturas-pruebas](https://outlook.office.com/mail/facturas-pruebas@integramente.onmicrosoft.com/inbox). | Hora, asunto, adjunto y número de factura. |
| 7 | Esperar al sondeo y verificar SATINFO. | Estado, `ProcessId`, archivo y número registrado. |
| 8 | Esperar un sondeo adicional y comprobar idempotencia. | Siguen existiendo exactamente 3 procesos, 3 registros y 3 PDFs; ninguno se duplica. |
| 9 | Esperar la actualización de proyección y comprobar la consulta. | Tres filas en `ConsultaPagosCopilot`, cada una en `Pendiente`. |

## Verificación de cada factura

Para cada proveedor, filtrar o buscar por el nombre o número de factura en los enlaces operativos.

### Comprobación obligatoria después del sondeo

1. Abrir [ProcesosFacturas](https://integramente.sharepoint.com/sites/facturas/Lists/ProcesosFacturas/AllItems.aspx), localizar la fila nueva del proveedor y abrirla.
2. Confirmar que `Estado` es `completed` y anotar el `ProcessId`. No continuar con el siguiente envío si el estado es distinto.
3. Abrir [RegistroFacturas](https://integramente.sharepoint.com/sites/facturas/Lists/RegistroFacturas/AllItems.aspx) y comprobar que existe exactamente una nueva fila para esa factura.
4. Abrir [Documentos / Facturas](https://integramente.sharepoint.com/sites/facturas/Shared%20Documents/Forms/AllItems.aspx?id=%2Fsites%2Ffacturas%2FShared%20Documents%2FFacturas), entrar en la carpeta del proveedor y confirmar que existe un único PDF nuevo.
5. Comprobar que no hay una incidencia abierta asociada en [Excepciones](https://integramente.sharepoint.com/sites/facturas/Lists/Excepciones/AllItems.aspx).

El nombre del PDF debe seguir la forma `<NUMERO_FACTURA>_<AAAA-MM-DD>_<IMPORTE_TOTAL>_<MONEDA>.pdf`. Por ejemplo, `P26CON037623604_2026-09-05_387.21_EUR.pdf` representa el número de factura, su fecha, el total y la moneda. El punto decimal se usa deliberadamente en el nombre técnico, aunque SharePoint muestre importes con coma según la configuración regional. La carpeta identifica al proveedor resuelto desde `MaestroProveedores`; `Modified By: SharePoint App` confirma el archivado automático.

| Punto de control | Resultado correcto |
|---|---|
| Outlook | El mensaje sigue en `Inbox` con un único PDF adjunto. |
| ProcesosFacturas | Una única fila nueva; `Estado = completed`. Guardar el `ProcessId`. |
| RegistroFacturas | Una única fila nueva con proveedor, número, fecha e importe extraídos. |
| Documentos / Facturas | Un PDF en `Facturas/<PROVEEDOR>/` cuyo nombre sigue `<NUMERO>_<AAAA-MM-DD>_<IMPORTE>_<MONEDA>.pdf`. |
| Excepciones | No aparece una incidencia abierta asociada al PDF. |
| ConsultaPagosCopilot | Tras su siguiente actualización, una fila con el proveedor y estado `Pendiente`. |

El registro y el archivo solo se crean cuando la factura supera validación fiscal y coincide inequívocamente con un proveedor activo del maestro. ENDESA puede usar su perfil de confianza reducida ya aprobado, pero conserva la exigencia de NIF exacto y coherencia fiscal.

## Si el resultado no es `completed`

No reenviar el correo ni modificar datos. Comunicar el proveedor, hora local, asunto y nombre del adjunto, y conservar el `ProcessId` si ya existe.

| Resultado | Qué comprobar | Siguiente actuación |
|---|---|---|
| `review_required` | La fila de `Excepciones` asociada. | Revisar el motivo; no cerrar la excepción sin validación humana. |
| `diverted` | Clasificación y motivo en `Excepciones`. | Confirmar que el PDF era realmente una factura antes de cualquier reintento. |
| No hay proceso tras 12 min | Outlook y Azure Logs. | Registrar la hora y revisar el último ciclo del temporizador. |
| Error técnico reintentable | Proceso y Azure Logs. | Esperar un ciclo adicional; el sistema reintenta sin reenvío. |

Consulta de diagnóstico para Azure Logs:

```kusto
union traces, exceptions
| where timestamp > ago(1h)
| where message contains "Invoice mailbox"
   or operation_Name contains "pollInvoiceMailbox"
| order by timestamp desc
| project timestamp, severityLevel, operation_Name, message,
          exceptionType = type, exceptionMessage = outerMessage
```

## Acta mínima de la prueba

| Proveedor | Hora de envío | Asunto / adjunto | Número extraído | ProcessId | Estado | Ruta del PDF | Resultado de proyección |
|---|---|---|---|---|---|---|---|
| ENDESA |  |  |  |  |  |  |  |
| EMAS |  |  |  |  |  |  |  |
| SATINFO |  |  |  |  |  |  |  |

La campaña queda aceptada cuando los tres procesos terminan en `completed`, existen exactamente tres registros y tres PDFs, el ciclo posterior no añade duplicados y la proyección muestra las tres facturas como `Pendiente`.

## Fase 2 — Cargar previsiones y consultar el agente

Esta fase añade una decisión operativa de pago; no confirma ningún pago real ni modifica el resultado fiscal de la factura.

| Uso | Enlace |
|---|---|
| Comprobar las facturas de origen | [RegistroFacturas](https://integramente.sharepoint.com/sites/facturas/Lists/RegistroFacturas/AllItems.aspx) |
| Subir el libro de previsiones | [PrevisionesPagos](https://integramente.sharepoint.com/sites/facturas/Shared%20Documents/PrevisionesPagos) |
| Confirmar el archivo correctamente procesado | [ProcesadosPrevisiones](https://integramente.sharepoint.com/sites/facturas/Shared%20Documents/ProcesadosPrevisiones) |
| Revisar un error de importación | [ErroresPrevisiones](https://integramente.sharepoint.com/sites/facturas/Shared%20Documents/ErroresPrevisiones) |
| Ver previsiones persistidas | [PrevisionesPagos (lista)](https://integramente.sharepoint.com/sites/facturas/Lists/PrevisionesPagos/AllItems.aspx) |
| Ver el resultado para consultas | [ConsultaPagosCopilot](https://integramente.sharepoint.com/sites/facturas/Lists/ConsultaPagosCopilot/AllItems.aspx) |

### Carga segura

1. En [RegistroFacturas](https://integramente.sharepoint.com/sites/facturas/Lists/RegistroFacturas/AllItems.aspx), anotar para ENDESA y SATINFO el `NumeroFactura`, proveedor, importe y moneda actuales.
2. Antes de subirlo, comprobar que el Excel usa exclusivamente la hoja `PrevisionPagos`, contiene exactamente una fila por ENDESA y otra por SATINFO, y coincide exactamente con esos datos. No utilizar números de factura de una campaña anterior.
3. El libro debe incluir las 17 columnas del contrato: `PrevisionId`, `NumeroFactura`, `Proveedor`, `NIFProveedor`, `FechaFactura`, `FechaVencimiento`, `ImporteFactura`, `Moneda`, `FechaPagoPrevista`, `ImportePagoPrevisto`, `EstadoPrevision`, `ReferenciaPago`, `MetodoPago`, `Observaciones`, `FuenteDocumento`, `ConfianzaExtraccion` y `RequiereRevision`.
4. Usar un `PrevisionId` único por fila. Si el estado es `Programado`, `FechaPagoPrevista` es obligatoria. Los estados permitidos son `Pendiente`, `Programado`, `Parcial` y `Cancelado`; nunca `Pagado` ni `Pagada`.
5. Subir una única copia del XLSX a [PrevisionesPagos](https://integramente.sharepoint.com/sites/facturas/Shared%20Documents/PrevisionesPagos). No modificarlo ni cargar otra copia mientras se procesa.
6. Esperar hasta 12 minutos. Si la importación es correcta, el archivo se mueve a [ProcesadosPrevisiones](https://integramente.sharepoint.com/sites/facturas/Shared%20Documents/ProcesadosPrevisiones), aparecen dos filas en [PrevisionesPagos (lista)](https://integramente.sharepoint.com/sites/facturas/Lists/PrevisionesPagos/AllItems.aspx) y ENDESA y SATINFO pasan a `Programado` con su fecha prevista en [ConsultaPagosCopilot](https://integramente.sharepoint.com/sites/facturas/Lists/ConsultaPagosCopilot/AllItems.aspx).
7. Si termina en [ErroresPrevisiones](https://integramente.sharepoint.com/sites/facturas/Shared%20Documents/ErroresPrevisiones), no volver a cargarlo. Conservar el nombre y revisar la incidencia antes de corregir el libro.

### Regla específica para EMAS `F26/1334`

Si la fila de EMAS corresponde a la factura `F26/1334`, no debe incluirse en el libro de previsiones ni consultarse como pago pendiente. Es una factura emitida a cliente y representa un cobro, no una cuenta a pagar a proveedor. Antes de cargar el Excel, abrir esa fila en `RegistroFacturas`, editarla y guardar `ExcluirDePagos = Sí`. Debe conservarse como documento fiscal; las previsiones de esta campaña se limitarán a ENDESA y SATINFO salvo que se aporte una factura de proveedor distinta de EMAS.

### Consultas al agente

Abrir el agente **Asistente de pagos** y empezar una conversación nueva. Las preguntas deben referirse a números de factura de esta campaña. Ejemplos:

- `¿Cuál es el importe pendiente de la factura <NUMERO_DE_EMAS>?`
- `¿Cuál es la fecha prevista de pago de la factura <NUMERO_DE_ENDESA>?`
- `¿Qué pagos están programados entre el <FECHA_INICIO> y el <FECHA_FIN>?`

El agente debe expresar importes con dos decimales y moneda, distinguir `FechaVencimiento` de `FechaPagoPrevista` y no comunicar campos internos acabados en `Menor`.
