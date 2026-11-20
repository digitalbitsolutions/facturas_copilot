# Contexto de reanudación

Actualizado: 20 de noviembre de 2026, piloto de archivo SharePoint activo; política de vencimiento y barrera contra PDFs multifactura desplegadas y verificadas.

Responsable documentado: Néstor — Jefe de proyecto.

## Punto exacto de reanudación — 20 de noviembre de 2026

- La aceptación controlada de Straumann quedó completada a las 21:20:50 CET: `10 STRAUMANN OCT FRA 9100227659 (IMPLANTES).PDF` terminó `completed`, sin incidencias. Se registró proveedor `Manohay Dental S.A.U.` (`A80219462`), receptor `DC MOLINS, SL` (`B16896318`), factura `9100227659`, fecha `01/10/2026`, vencimiento `31/10/2026`, base `51,06 EUR`, IVA `5,99 EUR`, total `57,05 EUR` y tipos de IVA `21/10/0`. El PDF quedó archivado en `Facturas/DC MOLINS, SL/Manohay Dental S.A.U/9100227659_2026-10-01_57.05_EUR.pdf`.
- Se desplegaron las correcciones de Straumann: normalización comparativa del prefijo español `ES` en NIF, lectura fiscal de `prebuilt-layout` en páginas 1-2 solo si la cabecera fiscal no reconcilia, reconocimiento de las cabeceras `Tarifa` e `IVA`, y corroboración textual auditada de receptor. La producción ejecuta `6fb4282`, publicado correctamente mediante el workflow `44809410675`; `npm.cmd run check` superó 145 pruebas antes del despliegue.
- La corroboración final corrigió el nombre extraído `LABORATORIO MIRANDA` a `DC MOLINS, SL` únicamente tras evidenciar en el PDF `DC MOLINS SL SMILEXPRESS` y el NIF `ESB16896318`. La entrada `FieldAudit` conserva el valor previo, su confianza `0,808` y las dos líneas de evidencia. El alias `SMILEXPRESS` también fue añadido al receptor activo `DC_MOLINS`; no es por sí solo condición de aceptación.
- Se crearon y verificaron en SharePoint las columnas opcionales de elección `DueDateStatus` en `RegistroFacturas` y `ConsultaPagosCopilot`, con los valores `present` y `not_stated`, sin valor predeterminado.
- Producción ejecuta el commit `707672e` mediante el despliegue `44635262269`, terminado correctamente. Están activos `INVOICE_PROCESSING_ENABLED=True`, `INVOICE_RECIPIENT_ROUTING_ENABLED=True` e `INVOICE_FISCAL_DIAGNOSTIC_ONLY=False`.
- La protección desplegada deja `dueDate` vacío y persiste `dueDateStatus = not_stated` cuando la factura no declara vencimiento. Si hay indicios de vencimiento sin fecha fiable, mantiene la revisión. También desvía a revisión, sin archivo ni registro, un PDF cuyas páginas identifican números de factura diferentes.
- La primera prueba individual `cygnus 488 ANT 26.pdf`, recibida a las 00:13 CET y procesada a las 00:20:48 CET, quedó en `review_required` / `EX-06`. El vencimiento no fue una incidencia. Las únicas incidencias fueron confianza insuficiente de `recipientName` (< 0,80), `recipientTaxId` (< 0,80) e `invoiceDate` (< 0,85). No se creó archivo ni registro.
- Se entregó a Claude el resultado de proceso y se adjuntará el PDF Cygnus. Se espera su propuesta para completar esos tres campos solo cuando el texto sea inequívoco y el receptor se pueda validar contra `MaestroReceptores`, sin reducir umbrales ni debilitar la revisión segura.
- Se revisó e integró localmente la propuesta corregida: una corroboración textual exige un receptor activo con NIF completo y razón social/alias próximos, o una fecha explícita de factura/cabecera lugar-fecha. El fallback solo se activa con el enrutamiento de receptores, registra `fieldSource = text_fallback` y evidencia mínima en `ProcessRecord.fieldAudit`, y no inventa confianza ni cambia umbrales, tolerancias fiscales o la normalización del prefijo `ES`.
- El diagnóstico de campos de baja confianza queda limitado a `field`, `value`, `confidence`, `page` y `polygon`; no registra el resultado completo de Document Intelligence. `npm.cmd run check` superó 135 pruebas.
- Se creó manualmente en producción la columna multilínea `FieldAudit` en `ProcesosFacturas` el 20 de noviembre. El aprovisionamiento local también la declara para entornos nuevos. Se creó y verificó también el proveedor activo `CYGNUS_B87385308` (`B87385308`, alias `CYGNUS`).
- La corroboración textual se desplegó en producción mediante el workflow `44648472075`, correcto el 20 de noviembre, sobre el commit `d1f20f7`. La Function conserva los parámetros del piloto: procesamiento y enrutamiento de receptor activos, diagnóstico fiscal desactivado y previsiones desactivadas.
- La segunda prueba Cygnus se recibió a las 01:50:32 CET y fue procesada a las 02:00:31 CET. Terminó `completed`, sin incidencias: el fallback textual auditado completó receptor `TREO 2025, S.L.` (`B67915157`) y fecha de factura `01/11/2026`. Se registraron proveedor `Cygnus Asesoría Integral de la Empresa, S.L.` (`B87385308`), factura `488/ANT/26`, base `174,13 EUR`, IVA `36,57 EUR`, total `210,70 EUR` y vencimiento `06/11/2026`; el PDF quedó archivado en la carpeta del receptor y proveedor.
- Néstor aportó un Excel de referencia para el registro fiscal. Se acordó preparar hasta tres tipos de IVA por factura, visibles como porcentajes (`21`, `10`, `4`) y con `0` exclusivamente en los tramos no aplicables ya identificados. El commit `2de0ecb` añade `TipoIVA1`, `TipoIVA2` y `TipoIVA3` al modelo, extracción fiscal validada y aprovisionamiento; `npm.cmd run check` superó 139 pruebas. Se publicó y desplegó en producción mediante el workflow `44736158156`, terminado correctamente el 20 de noviembre. El despliegue no incorpora todavía IRPF.
- Se crearon manualmente en producción las columnas numéricas `RegistroFacturas.TipoIVA1`, `TipoIVA2` y `TipoIVA3`, sin valor predeterminado. También se configuraron las vistas públicas `Registro fiscal` en `RegistroFacturas` y `Estado de pagos` en `ConsultaPagosCopilot`; esta última usa colores: pendiente rojo, programado/parcial/en revisión ocre, pagada verde y cancelada gris. No se modificó ningún dato existente.
- Vidrios es una prueba negativa: el prefijo fiscal español `ES` se compara ahora contra el NIF nacional solo si tiene formato español reconocible, pero su nombre no coincide con TREO. Debe quedarse en revisión sin archivo ni registro; Néstor debe decidir si se trata de una factura rectificada o de un alias autorizado antes de cualquier reenvío.
- Se dio de alta y activó el proveedor `MANOHAY_A80219462` en `MaestroProveedores`: razón social `Manohay Dental S.A.U.`, NIF nacional `A80219462`, aliases `STRAUMANN; STRAUMANN GROUP; MANOHAY DENTAL` y sin confianza reducida. La candidata Straumann ya quedó validada con los prefijos fiscales `ESA80219462` y `ESB16896318` comparados contra sus NIF nacionales.
- Néstor confirmó el tratamiento de IRPF: se deben extraer y conservar importe y porcentaje; si hay IRPF pero el IVA es `0`, la factura queda `review_required`, sin archivo ni registro. La implementación añade `irpfAmount` (con el signo del documento) e `irpfRate`, persiste `RegistroFacturas.IRPF` y `TipoIRPF`, y valida la igualdad documental `base + IVA + IRPF = total` sin recalcular ni sustituir el total. Se crearon manualmente en producción ambas columnas numéricas sin valor predeterminado y se desplegó `e075711` mediante el workflow `44821722816`, correcto el 20 de noviembre. `npm.cmd run check` superó 151 pruebas. Falta la prueba controlada con una factura real con IRPF.
- Primera prueba real de IRPF sin IVA: `FACTURA SMILEXPRESS 001.pdf`, recibida a las 23:28 CET del 20 de noviembre, fue procesada a las 23:30. La clasificación fue `invoice` (confianza `0,89`), pero terminó `review_required` / `EX-06` con `Invoice extraction requires review`, antes de alcanzar la regla específica de IRPF sin IVA (`EX-05`). `ValidationIssues` identifica confianza insuficiente de `supplierName` (< `0,75`), `supplierTaxId` (< `0,80`), `vatAmount` (< `0,80`), `totalAmount` (< `0,90`), `currency` (< `0,80`) y `dueDate` (< `0,65`), además de `amount_mismatch` entre base, IVA, IRPF y total. La ausencia de `DocumentUrl` y `FinalFilename` evidencia que no se archivó el PDF. La corrección debe ser acotada: no bajar umbrales globales; recuperar solo valores fiscales etiquetados que reconcilien `base + IVA + IRPF = total`, y no interpretar los datos bancarios de pago como vencimiento.
- La corrección de la prueba IRPF se verificó con `npm.cmd run check` (153 pruebas) y se desplegó en producción mediante el workflow `44833413986`, terminado correctamente a las 23:02 UTC del 20 de noviembre (00:02 CET del 21), sobre el commit `9fca975`. Exige etiquetas de base, IVA y total, igualdad exacta con el IRPF documentado, y cruza la identidad del proveedor únicamente por NIF exacto contra un registro maestro activo. Así se elimina solo la confianza del modelo para esos valores corroborados; los controles de formato, obligatoriedad y fiscalidad permanecen. El caso representativo debe terminar en `review_required` / `EX-05` y no archivar ni registrar; falta repetirlo en producción.
- La repetición recibida a las 00:04 CET sí corroboró el proveedor por NIF, pero a las 00:10 CET quedó todavía en `review_required` / `EX-06`: persistieron los avisos de IVA, total, moneda, vencimiento y conciliación fiscal; no hubo archivo ni registro. El ajuste final `d9b2b25` toma un resumen fiscal completo de una única fuente (también del texto principal del modelo de factura), conserva el signo del IRPF allí etiquetado y no mezcla valores entre fuentes. Superó 153 pruebas y se desplegó correctamente mediante el workflow `44835984735`. Hace falta un único correo nuevo: el anterior es terminal por idempotencia.
- Se observó un candidato real que no llegó a `Facturas Copilot`: tenía adjunto, pero el asunto usaba `FAC` en vez de la palabra literal `factura`, única variante cubierta por la regla actual. Después de completar y ajustar la prueba de IRPF se debe ampliar, revisar y probar la regla de Outlook para admitir de forma segura ese formato abreviado, sin reprocesar el histórico.
- Se añadieron en `MaestroReceptores` los aliases `DC 8CARD` y `DC 8 CARD` al registro activo `TREO_2025` (`B67915157`) y el receptor activo `DC_VIC` / `DC VIC, SL` (`B16896227`), con aliases `DC VIC`, `DC VIC SL` y `DENTALVIC`.

## Punto exacto de reanudación — 19 de noviembre de 2026

- Producción ejecuta el commit `93f3271`; el despliegue `44626265818` desactivó `INVOICE_FISCAL_DIAGNOSTIC_ONLY`. Las facturas válidas pueden avanzar a registro, líneas y archivo en SharePoint. Las pruebas anteriores que terminaron en diagnóstico no se reprocesan automáticamente.
- DENTALIS validó la extracción fiscal de la página 3: base `2.917,35`, IVA `595,85` y total `3.513,20`. Document Intelligence entrega la cabecera `Total �`, que el extractor normaliza de forma segura.
- Straumann se clasificó como factura y quedó en `review_required` mientras el diagnóstico estaba activo. Esclatoil también se clasificó como factura, pero al desactivar el diagnóstico quedó en revisión `EX-06`: la única incidencia fue `dueDate confidence is below 0.65`.
- La política local `due-date.ts` conserva el umbral de `0,65`: si una factura no declara vencimiento, descarta cualquier fecha dudosa y marca `dueDateStatus = not_stated`; si declara indicios de vencimiento sin una fecha fiable, permanece en revisión. No se deduce nunca el vencimiento de la fecha de factura ni de `Data valor`.
- `RegistroFacturas.FechaVencimiento` es opcional y admite vacío. Falta la columna `dueDateStatus` (sin equivalente actual), necesaria para persistir `present` o `not_stated` y proyectarlo a `ConsultaPagosCopilot`. No se ha creado ni modificado esa columna; los cambios locales no se han desplegado.
- Esclatoil no se debe volver a enviar ni archivar: su PDF contiene cuatro facturas distintas (`VEB-26452129`, `26452130`, `26452131` y `26452132`). La versión local añade una barrera que revisa los identificadores página a página —respetando el límite F0 de dos páginas por operación— y desvía a revisión si encuentra números distintos. La producción vigente solo analiza inicialmente las páginas 1–2, y la página 3 condicionalmente para el resumen fiscal; podría elegir el primer documento devuelto y archivar el PDF completo, por lo que no se desplegará hasta completar esa barrera y el esquema.
- Validación local más reciente: `npm.cmd run check` superó 126 pruebas, incluidas las 9 comprobaciones de `due-date.test.ts` y la regresión que detecta números de factura distintos por página.
- Objetivo inmediato: tras confirmar el esquema `dueDateStatus`, desplegar la protección; probar una factura individual de Cygnus y otra de Vidrios hasta obtener `completed`, PDF archivado, fila en `RegistroFacturas` y líneas; después crear y probar el agente de Copilot contra `ConsultaPagosCopilot` con consultas de factura, importe, vencimiento y ausencia de vencimiento.

## Punto exacto de reanudación — 17 de noviembre de 2026

- Producción desplegada correctamente desde `main` mediante GitHub Actions/OIDC: ejecución `44140874826` y relanzamiento `44142537178`. Function App: `func-facturas-copilot-prod-x3vbp5xlyl4ua`.
- Los proveedores de recursos requeridos ya están registrados: `Microsoft.Storage`, `Microsoft.CognitiveServices`, `Microsoft.KeyVault`, `Microsoft.Web`, `Microsoft.OperationalInsights` y `Microsoft.Insights`.
- La identidad administrada de producción es `7a133f34-b993-407d-8a14-90b0097d5691` (client ID `838013ee-7821-4ade-9a1e-3f215a8ddd48`). Tiene `Sites.Selected` y permiso `write` exclusivamente sobre `https://grupmedicdental.sharepoint.com/sites/facturas`; no tiene acceso global a SharePoint.
- Miguel Yesan figura asignado como `Global Administrator` en Entra. Como su identidad es invitada B2B, Exchange no expuso los cmdlets de Application RBAC para su sesión. Se asignó temporalmente `Exchange Administrator` a la cuenta interna `direccionfinanciera@grupmedicdental.com` para la configuración y se retiró inmediatamente al terminar.
- El 18 de noviembre se creó la referencia de identidad administrada en Exchange y se asignó `Application Mail.Read` exclusivamente a `direccionfinanciera@grupmedicdental.com`, con el alcance `FacturasCopilot-direccionfinanciera-Only`. `Test-ServicePrincipalAuthorization` devolvió `InScope=True`; no existe ningún permiso `Mail.Read` global.
- Las variables de seguridad permanecen cerradas: `INVOICE_PROCESSING_ENABLED=False`, `INVOICE_PROCESSING_NOT_BEFORE=9999-12-31T23:59:59Z` y `PAYMENT_FORECAST_IMPORT_ENABLED=False`. No realizar pruebas con correos/facturas reales hasta completar y verificar el acceso al buzón.
- La API de producción responde con `401` sin token, comportamiento esperado. El consentimiento de Azure CLI para `api://c1ab74c4-2f44-4641-80f9-be83c5724b4d/.default` sigue pendiente si se quiere volver a verificar `/api/health` autenticado.
- La funcionalidad solicitada por cliente partió de `feature/archivo-por-receptor`; el 18 de noviembre se adaptó sin `Área`. Néstor confirmó que MÁRKETING es un ejemplo de `Concepto`, no un `Área`: el campo `Área` no se incorporará. Si se requieren búsquedas por concepto, se deberá acordar su catálogo y extraerlos de las líneas/descripciones de la factura, no del concepto del extracto bancario. Una factura puede tener varios conceptos: se conservarán como líneas relacionadas, no en un único campo que descarte información.
- El 18 de noviembre se implementó y publicó el commit `84b298d`: receptor validable contra `MaestroReceptores`, archivado por sociedad receptora y lista idempotente `LineasFactura` con una fila por ítem extraído. No existe campo ni columna `Área`. La extracción conserva descripción, cantidad, precio unitario e importe cuando Document Intelligence los proporciona. `npm.cmd run check` terminó correctamente: compilación y 81 pruebas superadas. El workflow de producción `44357513227` finalizó correctamente, publicando infraestructura y Function con los procesamientos aún desactivados.
- El 18 de noviembre, mediante Microsoft Graph y una cuenta administradora del tenant, se crearon en `https://grupmedicdental.sharepoint.com/sites/facturas` las listas `LineasFactura` y `MaestroReceptores`; también se añadieron `RegistroFacturas.Receptor` y `RegistroFacturas.NIFReceptor`. No se ha cargado ningún receptor ni se ha habilitado el procesamiento.
- El 18 de noviembre se cargaron y activaron cinco receptores en `MaestroReceptores`: `TREO_2025` (`B67915157`), `DENTALIS_DICTUM` (`B55641500`), `DENTAL_RIPOLL` (`B16796930`), `DENTAL_CLINIC_REUS` (`B44833002`) y `DC_MOLINS` (`B16896318`). Sus aliases comerciales se almacenaron separados por punto y coma, el formato que consume el directorio de receptores. No se ha habilitado el procesamiento.
- La ejecución 63 de `Deploy Azure Function` (`44388498841`) terminó correctamente el 18 de noviembre a las 20:14 UTC sobre el commit `1031018`. Es un piloto acotado: `INVOICE_PROCESSING_ENABLED=true`, `INVOICE_RECIPIENT_ROUTING_ENABLED=true`, `INVOICE_PROCESSING_NOT_BEFORE=2026-11-18T20:07:43Z` y `PAYMENT_FORECAST_IMPORT_ENABLED=false`. Solo puede procesar correos recibidos desde ese corte, con un receptor activo en `MaestroReceptores`.
- El 18 de noviembre se creó y activó en `direccionfinanciera@grupmedicdental.com` la regla de Outlook `Facturas Copilot - candidatas 2`, situada en primera posición. Mueve a `Facturas Copilot` los correos nuevos que tienen adjuntos y contienen `factura` en el asunto; no se ejecutó sobre el histórico. La regla solo enruta candidatos: la Function conserva la clasificación, validación de proveedor y comprobación de receptor activo antes de archivar.
- La primera prueba de producción llegó correctamente a `Facturas Copilot` mediante la regla y el sondeo de las 21:20:30 UTC leyó un correo y un PDF. Se desvió de forma segura con `EX-03`: `prebuilt-read` detectó solo el encabezado `Factura`, insuficiente para el umbral de clasificación, por lo que no se creó registro, líneas ni archivo. La excepción queda abierta como evidencia y el proceso es terminal por idempotencia.
- El falso negativo se corrigió en el commit `88dc8c0`: el clasificador suma la señal del nombre del adjunto únicamente cuando el texto ya contiene un encabezado `Factura` o `Invoice`; un nombre de archivo por sí solo no habilita la extracción. `npm.cmd run check` terminó correctamente con 83 pruebas superadas y el despliegue de producción `44401416713` finalizó correctamente. Falta enviar un correo nuevo con el mismo PDF para repetir la prueba.
- La segunda prueba del PDF DENTALIS fue clasificada correctamente como `invoice` (confianza `0.85`), pero quedó en `review_required` con `EX-05`: el resultado del modelo no aportó `SubTotal` ni `TotalTax`. El proceso no archivó ni registró importes incompletos. El commit `ffbbe77` incorpora el desglose `TaxDetails` como alternativa para sumar base e IVA, con prueba automatizada; `npm.cmd run check` superó 84 pruebas y el despliegue de producción `44407912684` terminó correctamente. Falta un tercer correo nuevo para comprobar el archivado y registro final.
- La tercera prueba mantuvo `EX-05`: este PDF tampoco aportó el desglose `TaxDetails`. El commit `36e916c` suma como alternativa los importes de todas las líneas reconocidas y deriva el IVA desde el total solo si los importes son coherentes. `npm.cmd run check` superó 85 pruebas y el despliegue de producción `44411197806` terminó correctamente. Falta un cuarto correo nuevo para comprobar el archivado y registro final.
- El diagnóstico seguro de la cuarta prueba confirmó que el modelo reconoce `Items.Amount`, pero entrega esos importes como texto con formato español. El commit `1f3f5b5` normaliza esos valores antes de sumar la base y derivar el IVA frente al total, y elimina el diagnóstico temporal. `npm.cmd run check` superó 86 pruebas y el despliegue de producción `44417364990` terminó correctamente. Falta un correo nuevo para comprobar el archivado y registro final.
- El 19 de noviembre se desplegaron sucesivamente alternativas para formatos internacionales y datos fiscales por línea: `a8041f2` (`44418529873`), `7ed4f6d` (`44420149113`) y `5a4c308` (`44420765560`). La última versión, `3cfaf3d`, se desplegó correctamente mediante `44422250362` a las 00:38:59 CET. Cuando faltan `SubTotal`, `TotalTax` y `TaxDetails`, emite únicamente la forma técnica de `Items[].Tax` (`currency`, `number`, `text`, `percent`), sin valores ni datos fiscales. La Function conserva el piloto activo: `INVOICE_PROCESSING_ENABLED=True`, `INVOICE_RECIPIENT_ROUTING_ENABLED=True`, corte `2026-11-18T20:07:43Z` y previsiones desactivadas.
- **Pausa operativa (19 de noviembre):** las pruebas de DENTALIS demostraron que el correo entra en la carpeta correcta y se clasifica como factura, pero el modelo no proporciona aún los importes fiscales de cabecera. Por seguridad, cada caso queda en `review_required`/`EX-05`, sin crear registro ni archivar el PDF. Al reanudar, enviar un único correo nuevo con el mismo PDF, revisar la traza técnica de `Items[].Tax` en Application Insights y verificar si el proceso termina `completed` con registro, PDF y líneas. No enviar más correos de prueba durante la pausa.
- La prueba de reanudación del 19 de noviembre recibió el correo a las 17:42:49 CET y `pollInvoiceMailbox` lo procesó entre las 17:50:30 y las 17:50:42 CET. Lo clasificó como `invoice` con confianza `0.85`, pero quedó en `review_required`/`EX-05` porque faltó únicamente `vatAmount`; no se registró ni archivó. La traza confirmó que las 16 líneas no incluyen `Items[].Tax` de ninguna forma. El commit `f761bd7` normaliza también `InvoiceTotal` cuando llega como texto antes de derivar el IVA desde la base reconocida; conserva la coherencia fiscal y añade su prueba de regresión. `npm.cmd run check` superó 90 pruebas y el despliegue de producción `44572159960` terminó correctamente a las 18:01:31 CET. Falta un único correo nuevo con el mismo PDF para comprobar el resultado final.
- La prueba posterior, recibida a las 18:06:10 CET y procesada a las 18:10:46 CET, mantuvo `EX-05` solo por `vatAmount`; el primer ajuste no cubría la representación real de este total. El commit `f4146da` reutiliza exclusivamente en memoria el texto OCR ya obtenido en la clasificación: completa base e IVA solo si aparecen con etiquetas fiscales y su suma coincide con el total a céntimo. No persiste el texto OCR. `npm.cmd run check` superó 91 pruebas y el despliegue de producción `44575076411` terminó correctamente a las 18:16:51 CET. Falta un único correo nuevo con el mismo PDF para comprobar el resultado final.
- Se inspeccionó el PDF DENTALIS de tres páginas: el resumen fiscal íntegro está únicamente al pie de la página 3; las páginas 1-2 contienen líneas y subtotales acumulados. El siguiente ajuste solicita la página 3 por separado solo si faltan `SubTotal`, `TotalTax` y `TaxDetails` en el análisis inicial; sustituye los importes fiscales solo si base + IVA coincide con total y el número de factura coincide. Conserva el desvío a revisión si la página no está disponible o el resumen no es coherente. `npm.cmd run check` superó 92 pruebas. La cuenta de desarrollo no puede consultar Document Intelligence directamente (401); la prueba de producción usa la identidad administrada autorizada de la Function. Falta publicar el ajuste y enviar un único correo nuevo.
- El commit `ecddeda` implementa la lectura condicional de la página 3 y se desplegó correctamente en producción mediante `44579940353` a las 18:43:50 CET. Falta un único correo nuevo con el mismo PDF para comprobar proceso `completed`, registro, PDF y líneas.

## Objetivo

Automatizar la recepción y gestión de facturas en Microsoft 365: correo, clasificación y extracción con Document Intelligence, validación, detección de duplicados, archivo en SharePoint, registro y consultas mediante Copilot. La fase 1 incluye la importación manual de extractos Excel y la conciliación bancaria por reglas, sin conexión directa con bancos ni ejecución de pagos.

## Implantación en tenant destino — punto de parada

- Tenant destino confirmado: `DENTAL CATALUNYA`, dominio `dentalcatalunya.cat`, Tenant ID `06b60b9d-d7da-4f92-8722-79edd60d162a`.
- No se migrarán recursos ni datos del entorno de pruebas: se crearán desde cero la suscripción y recursos Azure, registro Entra, buzón, sitio SharePoint, biblioteca, carpetas, listas y permisos restringidos del tenant destino.
- La Azure Plan CSP ya está accesible en el tenant destino. Suscripción: `Azure subscription 1` (`aa3bc57d-1cef-486f-af7b-05caa3266f1f`). La cuenta `direccionfinanciera@grupmedicdental.com` figura como `Owner`.
- Se confirmó la región `Spain Central` y se creó el grupo de recursos `rg-facturas-copilot-prod`. No se ha desplegado todavía ningún recurso de la solución.
- `miguel.yesan@emas.es` fue invitado como usuario externo, aceptó la invitación y tiene `Contributor` y `User Access Administrator` exclusivamente sobre `rg-facturas-copilot-prod`. La asignación de ambos roles se verificó el 10 de noviembre.
- La identidad `miguel.yesan@emas.es` no pertenece al tenant ni integra el dominio EMAS en DENTAL CATALUNYA: es un invitado B2B externo y la dirección solo identifica al implantador técnico. No concede acceso a correo, usuarios o datos por sí misma; cada acceso procede de una asignación explícita. Se debe mantener un patrocinador y justificar cada asignación.
- El 7 de noviembre se verificó en Microsoft Graph, contra el objeto invitado de Miguel, que están activos `Application Administrator`, `SharePoint Administrator` y `Exchange Administrator`. El 10 de noviembre se confirmó también `User Access Administrator` exclusivamente en `rg-facturas-copilot-prod`. Los tres roles de Entra son de ámbito tenant; se recomienda mantenerlos temporales o elegibles mediante PIM y retirarlos al completar la configuración. No se deben conceder permisos a Miguel a nivel de suscripción.
- La autenticación interactiva de `miguel.yesan@emas.es` en Azure Portal funciona y permite seleccionar DENTAL CATALUNYA. Sigue fallando el inicio de sesión de Azure CLI mediante código de dispositivo con `service_not_available`; el 10 de noviembre se reprodujo con la correlación `34c1688c-e3b8-4a34-8e76-7e4665e5de0e` a las `2026-11-10T17:24:40Z`. Si se necesita Azure CLI como Miguel, queda por diagnosticar ese flujo; no bloquea la administración interactiva ni el despliegue posterior mediante OIDC.
- Se comprobó como alternativa que `direccionfinanciera@grupmedicdental.com` no tiene roles administrativos directos de Entra. Su rol `Owner` sobre la suscripción Azure no equivale a un rol de directorio y no permite crear el registro de aplicación ni administrar Exchange o SharePoint. No debe usarse como sustituto de Miguel para esas tareas.
- El inicio de sesión mediante código de dispositivo de `direccionfinanciera@grupmedicdental.com` funcionó el 7 de noviembre y recuperó correctamente `Azure subscription 1`; el problema queda aislado a la identidad invitada B2B de Miguel, no al tenant ni a ese flujo de autenticación.
- El 10 de noviembre se validó localmente la rama preparada para producción con `npm.cmd run check`: compilación correcta y 77 pruebas superadas. El 11 de noviembre se creó desde el portal de DENTAL CATALUNYA el registro Entra `facturas-copilot-api-prod`, de una sola organización, sin URI de redirección ni secreto. Su `Application (client) ID` es `c1ab74c4-2f44-4641-80f9-be83c5724b4d`; expone `api://c1ab74c4-2f44-4641-80f9-be83c5724b4d/access_as_user`, habilitado para consentimiento de administradores y usuarios. Falta crear y limitar la identidad OIDC de GitHub y configurar el entorno de despliegue con este identificador.
- Decisión transitoria del 11 de noviembre: hasta transferir el repositorio a la organización GitHub de EMAS, los despliegues de producción usarán `digitalbitsolutions/facturas_copilot`. La credencial federada se restringirá a su entorno GitHub `prod` y deberá sustituirse al transferir el repositorio.
- El 11 de noviembre se creó el entorno GitHub `prod` en `digitalbitsolutions/facturas_copilot`, restringido a la rama `main`. Los administradores no pueden omitir sus reglas de protección. Aún no se han designado revisores obligatorios; debe acordarse el responsable de aprobación antes de activar despliegues operativos.
- El entorno GitHub `prod` contiene los secretos `AZURE_CLIENT_ID`, `AZURE_TENANT_ID` y `AZURE_SUBSCRIPTION_ID`, además de la variable `ENTRA_API_CLIENT_ID` con el Client ID de `facturas-copilot-api-prod`. Falta crear el sitio SharePoint privado y sus estructuras, obtener los identificadores M365 y ejecutar el primer despliegue con los procesamientos desactivados.
- El 11 de noviembre se creó el registro Entra `facturas-copilot-github-deploy-prod`, de una sola organización, sin secreto ni URI de redirección. Su `Application (client) ID` es `a78c2abe-f35c-4624-bb53-439d53229306`. Tiene una única credencial federada `github-prod-environment`, restringida al sujeto `repo:digitalbitsolutions@26103651/facturas_copilot@1360297271:environment:prod`, y los roles `Contributor` y `Role Based Access Control Administrator` exclusivamente en `rg-facturas-copilot-prod`. Este último excluye por condición los roles `Owner`, `User Access Administrator` y `Role Based Access Control Administrator`, permitiendo a Bicep asignar solo roles técnicos no privilegiados a la identidad de la Function. Falta crear y proteger el entorno GitHub `prod` y configurar sus valores de despliegue.
- El 11 de noviembre Miguel Candela creó la carpeta `DATOS/01.FACTURAS` en el sitio existente `https://grupmedicdental.sharepoint.com/sites/finances`, dentro de la biblioteca `Documents`. La cuenta interna `direccionfinanciera@grupmedicdental.com` puede abrirla; el invitado B2B `miguel.yesan@emas.es` queda bloqueado porque el uso compartido externo del sitio está deshabilitado. La carpeta no se usará como perímetro de la automatización: la biblioteca del sitio contiene 59.481 elementos y el acceso técnico previsto se concede a nivel de sitio, no únicamente de carpeta.
- El mismo día Miguel Candela creó el sitio SharePoint privado y aislado `https://grupmedicdental.sharepoint.com/sites/facturas`, con permisos para `direccionfinanciera@grupmedicdental.com` y `miguel.yesan@emas.es`. Se verificó en una sesión privada que el invitado B2B puede abrir el sitio y dispone de acciones de creación. Los scripts de aprovisionamiento crearon las carpetas `Facturas`, `ExtractosBancarios`, `PrevisionesPagos`, `Configuracion`, `Procesados`, `Errores`, `ProcesadosPrevisiones` y `ErroresPrevisiones`, además de las 12 listas operativas y sus columnas. Los identificadores Graph de producción son `M365_SHAREPOINT_SITE_ID=grupmedicdental.sharepoint.com,5e10cc32-d90f-485c-9567-44eaf4aa6433,7f7eb0ea-1676-4fb9-a625-835dbe726622` y `M365_SHAREPOINT_DRIVE_ID=b!MswQXg_ZXEiVZ0Tq9KpkM-qwfn92FrlPpiWDXb5yZiLCNl9HnzpAS63KS8sY3mv3`. Antes del primer despliegue falta decidir y crear el buzón de entrada exclusivo de producción, y después autorizar a la Function exclusivamente sobre este sitio. No se habilitarán enlaces anónimos ni acceso global a SharePoint.
- Néstor confirmó que las facturas llegan al buzón `direccionfinanciera@grupmedicdental.com`; se creó la carpeta raíz vacía `Facturas Copilot` para aislar los mensajes autorizados para automatización. Se corrigió el lector: resuelve `M365_MAIL_FOLDER` por nombre y solo consulta dicha carpeta, en lugar de `Inbox`. Antes de activar procesamiento se definirá una regla o procedimiento operativo para mover únicamente facturas a esa carpeta y se autorizará la identidad administrada exclusivamente sobre ese buzón.
- El 14 de noviembre se intentó el primer despliegue de producción desde GitHub Actions con el commit `93202c3`, Document Intelligence S0 y todos los procesamientos desactivados. La comprobación (`npm run check`, 77 pruebas) y el inicio OIDC fueron correctos, pero ARM rechazó la infraestructura porque la suscripción no tiene registrados `Microsoft.Storage`, `Microsoft.CognitiveServices`, `Microsoft.KeyVault`, `Microsoft.Web` ni `Microsoft.OperationalInsights`. Un Owner de la suscripción debe registrar esos proveedores; la identidad OIDC está deliberadamente limitada al grupo de recursos y no puede hacerlo. Tras el registro, se debe relanzar el mismo workflow con idénticos parámetros.
- El 17 de noviembre el Owner registró los proveedores requeridos, incluido `Microsoft.Insights` que Application Insights necesita adicionalmente. El workflow `Deploy Azure Function` se relanzó desde `main` (ejecución `44140874826`) y finalizó correctamente: infraestructura y paquete de la Function publicados con OIDC. Facturas, extractos y previsiones permanecen desactivados; faltan los permisos restringidos de la identidad administrada y la activación controlada.

## Estado actual

- Repositorio: `https://github.com/digitalbitsolutions/facturas_copilot`.
- Rama de trabajo: `main`.
- Runtime local: Node.js 24, TypeScript ejecutado en modo nativo para desarrollo.
- Núcleo de factura terminado: campos, fechas, importes, moneda, confianza, coherencia, nombres seguros y clave de duplicidad.
- Procesador terminado: estados, excepciones, idempotencia, reproceso y aislamiento por adjunto.
- Integración M365 validada en el tenant: la Function lee el buzón restringido mediante Graph y archiva adjuntos PDF en SharePoint.
- Importación bancaria y conciliación local terminadas: lotes, validación, normalización, duplicidad, puntuación explicable y ambigüedad.
- Azure Functions v4 preparada con endpoints HTTP; infraestructura Flex Consumption y CI/CD preparadas.
- Pruebas actuales: 81 superadas.
- Tenant de pruebas verificado: `INTEGRAMENTE SL`, dominio `integramente.onmicrosoft.com` (`a1a2b397-4ac5-4f94-9004-67f158ea14e0`).
- Administrador comunicado: `demo@integramente.onmicrosoft.com`; la contraseña no se almacena.
- Licencias verificadas el 9 de septiembre de 2026: 25 `O365_BUSINESS_PREMIUM` y 25 `MICROSOFT_365_COPILOT_FOR_BUSINESS`, ambas habilitadas y sin asignar.
- Licencias Business Premium y Copilot asignadas a `demo@integramente.onmicrosoft.com` el 9 de septiembre de 2026.
- Registro Entra creado: `facturas-copilot-api-dev` (Client ID `66e78b9f-fbbe-4e80-beda-83469b6fee8c`), sin secreto ni certificado.
- Instancia empresarial (service principal) de la API creada y permiso delegado `access_as_user` concedido a Azure CLI. La llamada autenticada a `/api/health` devolvió `200` y versión `3.0` el 9 de septiembre de 2026.
- Sitio privado creado: `https://integramente.sharepoint.com/sites/facturas`.
- Biblioteca predeterminada preparada con `Facturas`, `ExtractosBancarios` y `Configuracion`.
- Libro `Configuracion/RegistroFacturas.xlsx` inicializado con `tblFacturas`, `tblLotesBancarios`, `tblMovimientos` y `tblConciliaciones`.
- Listas SharePoint creadas: `Excepciones` y `ConfiguracionConciliacion`.
- Suscripción Azure Trial activa: `e7e239ec-59fb-4128-b9e1-b7854f426f4d`, con crédito promocional. Los recursos de desarrollo se facturarán, si aplica, contra ese crédito Trial.
- Infraestructura Azure desplegada el 9 de septiembre de 2026 en `rg-facturas-copilot-dev` (Spain Central): Function App `func-facturas-copilot-dev-jbhyjbgfzr3iy`, almacenamiento, Log Analytics, Application Insights, Key Vault e identidades/RBAC gestionados.
- URL de la API de desarrollo: `https://func-facturas-copilot-dev-jbhyjbgfzr3iy.azurewebsites.net`. Los cuatro endpoints están registrados y devuelven `401` sin token, como corresponde a la protección Entra.
- La identidad administrada vigente mostrada por la Function App es `5dd4df87-b31f-4b55-ad16-54eec2939986`. El archivado real confirma acceso efectivo al buzón restringido y escritura en el sitio de facturas. El identificador histórico `23530c7b-95c2-44bf-b949-36750c962917` ya no debe utilizarse sin volver a verificarlo en Azure.
- OIDC de GitHub preparado: aplicación `facturas-copilot-github-deploy-dev` (Client ID `7db41108-d13f-4c3e-920a-832e875e1caa`), restringida a `digitalbitsolutions/facturas_copilot` en la rama `main` y entorno `dev`. Tiene `Contributor` y `Role Based Access Control Administrator` solo en `rg-facturas-copilot-dev`, necesarios para aplicar la infraestructura y sus permisos RBAC. Falta ejecutar correctamente el workflow de GitHub Actions.
- GitHub Actions OIDC validado. El workflow usa acciones basadas en Node 24 y configura el almacenamiento del host mediante `AzureWebJobsStorage__accountName` y `AzureWebJobsStorage__credential=managedidentity`, sin cadena de conexión.
- El 10 de septiembre de 2026 se completó una prueba real: correo recibido en `facturas-pruebas@integramente.onmicrosoft.com`, PDF leído por `pollInvoiceMailbox` y archivo creado en `Documentos/Facturas` con `Modified By: SharePoint App`.
- El código validado y desplegado corresponde al commit `09e14bf` (`Fix invoice attachment retrieval`).
- La idempotencia estricta y los nombres cortos se corrigieron y desplegaron en `79021de` (`Make SharePoint archiving truly idempotent`). La validación real posterior reconstruyó 7 adjuntos históricos con claves hash distintas y mantuvo sus fechas sin cambios durante varios ciclos.
- La deuda de despliegue quedó cerrada el 10 de septiembre: `9d5aed8` persiste los tres ajustes M365 mediante Bicep y `8a7a225` actualiza las acciones a Node 24/Azure Login v3 y usa `AzureWebJobsStorage__accountName`. El redespliegue terminó sin warnings; las variables y los 7 documentos persistieron sin cambios.
- El 10 de septiembre se desplegó Document Intelligence F0 en `northeurope` y se evaluaron cuatro documentos reales fuera de Git: uno completo y coherente; uno con base derivable y confianza fiscal baja; uno sin desglose fiscal; y una liquidación bancaria que el modelo confundió con factura. Los hallazgos originaron mapeo de razón social, derivación conservadora de base y rechazo de base cero.
- La prueba extremo a extremo de `/api/invoices/extract` funcionó con autenticación Entra e identidad administrada. Una factura completa produjo importes correctos y coherentes, pero quedó en revisión porque proveedor, número, vencimiento y base no alcanzaron confianza `0,8`; no se reducirá el umbral global sin reglas adicionales.
- La política piloto usa umbrales por campo (`0,75` proveedor, `0,70` número, `0,85` fecha, `0,65` vencimiento, `0,40` base, `0,80` IVA, `0,90` total y `0,80` moneda), mantiene `0,8` como respaldo y nunca sustituye la validación determinista de formatos y coherencia fiscal.
- La identidad del proveedor se resuelve contra la lista `MaestroProveedores`: NIF exacto y único cuando está disponible, o razón social/alias normalizado si no lo está. Proveedores desconocidos, inactivos, contradictorios o ambiguos quedan en revisión antes de archivar.
- El 11 de septiembre se aprovisionó `MaestroProveedores` y se verificó el circuito desplegado con una factura autorizada: NIF extraído con confianza `0,829`, coincidencia `tax_id` con un proveedor activo y `validation.valid = true` sin incidencias.
- La clasificación previa lee las páginas 1-2 con `prebuilt-read` y decide mediante señales auditables entre `invoice`, `bank_settlement` y `other`. Solo las facturas continúan a `prebuilt-invoice`; evidencia insuficiente se detiene de forma conservadora.
- La clasificación desplegada se verificó con tres PDF: factura (`invoice`, confianza `0,89`, extracción y validación completas), liquidación (`bank_settlement`, `0,99`, extracción omitida) y documento no fiscal (`other`, `0,5`, extracción omitida).
- El sondeo del buzón está conectado al procesador completo. `ProcesosFacturas` conserva cada transición y excepción por `ProcessId`; `RegistroFacturas` impone unicidad de proceso y clave de duplicidad. `INVOICE_PROCESSING_ENABLED=false` y la fecha `INVOICE_PROCESSING_NOT_BEFORE` evitan procesar el histórico hasta completar una activación controlada.
- La activación controlada del 11 de septiembre procesó un correo nuevo con factura: estado `completed`, una fila en `RegistroFacturas` y un PDF creado por `SharePoint App`. Tras el ciclo siguiente se mantuvieron una sola fila de proceso, una sola factura y un solo archivo sin cambio de modificación, confirmando el replay idempotente persistente.
- Application Insights confirmó la misma secuencia: primera ejecución `completed=1`, `idempotentReplays=0`; dos ciclos posteriores `completed=1`, `idempotentReplays=1`; `diverted`, `reviewRequired` y `failed` permanecieron en cero.
- Las rutas negativas también se verificaron desde el buzón: una liquidación terminó `diverted` con `EX-03`/`bank_settlement`, y un CV terminó `diverted` con `EX-03`/`other`. Ninguno creó fila en `RegistroFacturas` ni PDF; la lista conservó únicamente SATINFO.
- La prueba de proveedor inactivo terminó correctamente el 11 de septiembre: un correo nuevo con `FASF198033.pdf` produjo `review_required` y `EX-06` (`Supplier identity requires review`), sin aumentar `RegistroFacturas` ni crear otro PDF. SATINFO se restauró inmediatamente a `Activo = Sí` a las 10:31:34 UTC.
- La prueba de duplicado de negocio terminó correctamente en el ciclo de las 10:40:30 UTC: otro correo nuevo con `FASF198033.pdf`, ya con SATINFO activo, produjo `review_required` y `EX-07`, apuntando al proceso original. `RegistroFacturas` permaneció en una fila, `Documentos/Facturas` en 8 archivos y la clave de duplicidad original no cambió.
- El 11 de septiembre se crearon las vistas operativas del sitio: `Pendientes de revisión` en `ProcesosFacturas` (filtro `Estado = review_required`) y `Excepciones abiertas` en `Excepciones` (filtro `Estado = Abierta`), ambas con límite de 30 elementos. Se retiró después la aplicación temporal sin secreto usada para administrarlas.
- El 11 de septiembre se validó la operación manual de excepciones mediante los endpoints autenticados. `EX-03` se descartó como liquidación bancaria, `EX-07` se descartó tras verificar el proceso fiscal original y `EX-06` se resolvió tras confirmar activo al proveedor SATINFO. Cada cierre conserva responsable, acción, resultado y fecha UTC en `Excepciones`.
- El commit `e4ada44` sincroniza esos cierres con `ProcesosFacturas`: `Descartada` pasa a `discarded` y `Resuelta` a `resolved`, sin modificar facturas, PDFs ni registros fiscales. Tras desplegarlo con GitHub Actions, los tres procesos de prueba mostraron los estados esperados y la vista `Pendientes de revisión` quedó vacía tras verificación manual.
- El patrón vigente de archivo es `Facturas/<PROVEEDOR>/<NUMERO>_<AAAA-MM-DD>_<IMPORTE>_<MONEDA>.pdf`. La carpeta del proveedor se crea de forma idempotente, el nombre visible no repite el proveedor y se añade un sufijo hash solo ante una colisión real. La evidencia histórica del 15 de septiembre conserva el formato entonces aplicado `AAAA-DDMM` en `docs/ACCEPTANCE_2026-09-15.md`.
- EMAS se validó contra XML Factur-X y se archivó correctamente; Endesa se validó tras aprobar su perfil acotado en `MaestroProveedores.AceptaConfianzaReducida`, siempre condicionado a NIF exacto, proveedor activo y coherencia fiscal. Evidencia en `docs/ACCEPTANCE_2026-09-15.md`.
- El commit `6f83b03` introduce perfiles versionados de extractos. `bankinter-simulated-csv-v1` mapea el CSV de pruebas de cabeceras minúsculas y conserva signo de cargos/abonos; `standard-es-v1` queda disponible para rollback. Simulación local: 46 movimientos, 16 positivos y 30 negativos; SATINFO `high`, Endesa `probable` por comisión de 0,02 EUR y EMAS sin match por cobros parciales.
- Propuesta comercial inicial para España documentada en `docs/COMMERCIAL_SPAIN.md`: implantación + cuota mensual + consumo cloud transparente; sin dependencia inicial de API bancaria. Pendiente definir formato del Excel de previsión de pagos e importador correspondiente.
- El 18 de septiembre se validaron CA-17 a CA-19 contra la Function desplegada y las listas reales `Conciliaciones` y `MovimientosBancarios`, con identidad Entra. Una propuesta ambigua quedó en `PendienteRevision`/`EnRevision`; una confirmación dejó la conciliación y el movimiento en `Conciliada`/`Conciliado`; y un rechazo quedó en `Rechazada`/`EnRevision`. Evidencia: `docs/ACCEPTANCE_2026-09-18.md`.
- El 18 de septiembre se creó `ConsultaPagosCopilot`, proyección SharePoint de `RegistroFacturas`, `PrevisionesPagos`, `Conciliaciones` y `MovimientosBancarios`. El temporizador actualiza una fila por documento; `Pagada` requiere una conciliación confirmada por una persona. La marca `ExcluirDePagos` conserva el documento fiscal en `RegistroFacturas` pero lo retira de la proyección; se aplicó a la factura histórica emitida `F26/1334`.
- Se validó el circuito completo con tres PDF digitales simulados enviados en un único correo: EMAS `EMAS-2026-3001` (79,86 EUR), ENDESA `ENDESA-2026-4001` (145,20 EUR) y SATINFO `SATINFO-2026-5001` (200,86 EUR). Los tres quedaron `completed`, archivados y registrados; aparecen como `Pendiente` en `ConsultaPagosCopilot` hasta cargar su previsión. Evidencia: `docs/ACCEPTANCE_2026-09-18.md`.
- Durante ese envío, Document Intelligence F0 devolvió HTTP 429 para el tercer adjunto. El commit `9da76c4` permite reintentar en el siguiente sondeo solamente los procesos `review_required` con excepción técnica marcada como reintentable; los resultados funcionales terminales siguen siendo idempotentes. El reintento completó EMAS sin reenvío ni duplicar ENDESA o SATINFO.
- La prueba de consultas Copilot queda pendiente: el Copilot general de Microsoft 365 no recuperó con fiabilidad las listas. La siguiente fase es un agente de Copilot Studio con `ConsultaPagosCopilot` como fuente directa, tras cargar las previsiones de pago y confirmar la capacidad/licencia necesaria.
- El 21 de septiembre se creó el agente ligero de Microsoft 365 Copilot `Asistente de pagos`, conectado a `ConsultaPagosCopilot`, y se verificó que recupera las tres facturas pendientes. La primera carga de previsiones llegó a `ErroresPrevisiones` por un HTTP 400 de Graph al filtrar `PrevisionId`; el commit `3efc147` sustituye ese filtro por una comparación local, añade regresión y se desplegó correctamente mediante GitHub Actions. La importación de previsiones sigue habilitada; falta devolver `Prevision_Pagos_piloto.xlsx` desde `ErroresPrevisiones` a `PrevisionesPagos` para reintentarla.
- El 22 de septiembre se cargó `Prevision_Pagos_piloto.xlsx` con tres fechas previstas de pago. Las tres previsiones se persistieron y la proyección las mostró como `Programado`; el agente `Asistente de pagos` distinguió correctamente el vencimiento fiscal de la fecha prevista de pago para EMAS. Tras persistir, Graph devolvió HTTP 409 al mover el archivo a `ProcesadosPrevisiones` porque ya existía un homónimo, por lo que el archivo terminó en `ErroresPrevisiones` pese al éxito funcional. Pendiente corregir ese archivado, omitir fechas opcionales vacías al escribir en SharePoint y exigir fecha prevista cuando el estado sea `Programado`. Evidencia: `docs/ACCEPTANCE_2026-09-22.md`.
- El 22 de septiembre se implementó localmente la evolución de previsiones: actualización por `PrevisionId` con historial `HistorialPrevisiones`, fechas vacías omitidas al crear y limpiadas con `null` al actualizar, `Programado` sin fecha rechazada y renombrado estable ante colisión HTTP 409 al archivar. Falta aprovisionar la lista, desplegar y repetir la aceptación en el tenant.
- El 22 de septiembre se aprovisionó `HistorialPrevisiones` y se desplegaron `a1da85e`, `a63f6a8` y `8d1863c`. La aceptación real validó actualización por `PrevisionId`, auditoría, `Pendiente` sin fecha, replay idempotente y archivado. La prueba final `Prevision_Pagos_iso_final.xlsx` creó exactamente una actualización para EMAS; la normalización de fechas ISO de Graph elimina falsos cambios en las demás previsiones. Evidencia: `docs/ACCEPTANCE_2026-09-22.md`.
- El 24 de septiembre se añadieron a `ConsultaPagosCopilot` los campos de presentación de importe y se desplegó `dd5dc45`. El ciclo de proyección de las 07:30:46 UTC actualizó las cinco filas existentes con importes como `79,86 EUR`, sin sustituir los campos internos en céntimos. La configuración que debe pegarse en el agente está en `docs/COPILOT_PAYMENT_AGENT.md`.
- El 24 de septiembre se completó la limpieza operativa para una campaña desde cero: archivos, buzón y diez listas operativas quedaron vacíos; `MaestroProveedores` conserva tres proveedores. La Function App se reactivó y está `Running`, con corte de facturas `2026-09-24T08:41:07Z`.
- El despliegue vigente es manual desde GitHub Actions sobre `main`, con OIDC y Bicep. GitHub no es obligatorio para Azure Functions: Azure DevOps o herramientas locales pueden desplegar paquetes, aunque Flex Consumption no admite la edición directa del portal, FTP ni Git local. Detalle en `docs/DEPLOYMENT_MODEL.md`.
- No existe aún ningún recurso productivo ni credencial almacenada.

## Evidencia y diagnóstico del piloto de correo

Flujo validado:

```text
Remitente externo
  → Exchange Online / Inbox de facturas-pruebas
  → temporizador pollInvoiceMailbox
  → Microsoft Graph con identidad administrada
  → biblioteca Documentos / carpeta Facturas
```

Cronología del 10 de septiembre de 2026:

1. Se confirmó la llegada de varios correos con PDF al buzón compartido.
2. SharePoint permaneció vacío y Log Analytics mostró primero `Missing app setting`.
3. Se añadieron manualmente `M365_SHAREPOINT_SITE_ID` y `M365_SHAREPOINT_DRIVE_ID`.
4. Graph devolvió HTTP 400 porque la consulta aplicaba `$select=contentBytes` al tipo base `microsoft.graph.attachment`. Se eliminó ese `$select` en `src/microsoft365/mail-poller.ts` y se añadió una prueba de regresión.
5. Se publicó el commit `09e14bf` y se lanzó una ejecución nueva de `Deploy Azure Function` sobre `main`; repetir una ejecución antigua no despliega el commit nuevo.
6. El despliegue Bicep sustituyó los ajustes manuales. Se volvieron a crear las tres variables operativas.
7. Graph devolvió HTTP 404 `ErrorInvalidUser` porque `M365_MAILBOX_ADDRESS` contenía accidentalmente el Site ID. Se corrigió al buzón SMTP.
8. En el siguiente ciclo el PDF apareció en SharePoint, modificado por `SharePoint App`.
9. Se detectó que la implementación inicial no creaba filas adicionales, pero ejecutaba `PUT` en cada ciclo y actualizaba `Modified`. Además, truncar los IDs largos producía colisiones entre adjuntos con prefijos comunes.
10. En `79021de` se sustituyó el identificador visible por un hash SHA-256 truncado y estable del par mensaje/adjunto, se añadió una consulta previa y se evitó el `PUT` cuando el elemento ya existe.
11. Tras eliminar los cuatro artefactos antiguos, el sistema reconstruyó 7 archivos reales: cuatro facturas de septiembre y las facturas 2023/12, 2023/13 y 2023/14. El resultado demostró que el esquema antiguo había ocultado adjuntos por colisión de nombres.
12. Después de aproximadamente una hora y varios ciclos, los 7 archivos conservaron la misma antigüedad de modificación. Quedó validada la idempotencia sin sobrescritura.

Configuración operativa no secreta:

| Ajuste | Valor/criterio |
|---|---|
| `M365_MAILBOX_ADDRESS` | `facturas-pruebas@integramente.onmicrosoft.com` |
| `M365_SHAREPOINT_SITE_ID` | `integramente.sharepoint.com,22c53ae6-a4db-491e-85b0-e976c559c890,c7b7b19b-73af-42e3-8b2b-67f7036ded5b` |
| `M365_SHAREPOINT_DRIVE_ID` | ID de la biblioteca predeterminada obtenido con Graph; empieza por `b!` |
| `M365_INVOICE_FOLDER` | `Facturas` |
| `INVOICE_MAIL_POLL_SCHEDULE` | `30 */10 * * * *` |

El temporizador se ejecuta cada diez minutos en el segundo 30. Application Insights presenta marcas UTC; durante esta prueba España estaba en UTC+2, por lo que `09:00:30 UTC` equivalía a `11:00:30` local.

## Arquitectura acordada

```text
Outlook → Azure Function TypeScript → Microsoft Graph → SharePoint
              ├─ clasificación y extracción con Document Intelligence
              ├─ reglas, validación e idempotencia
              └─ ProcesosFacturas, RegistroFacturas y Excepciones

Extracto Excel en SharePoint → Azure Function programada
                                      ↓
                         Lists: lotes, movimientos y conciliación
```

- Código fuente y CI/CD: GitHub.
- Backend: Azure Functions Runtime 4, Node.js 24, plan Flex Consumption.
- Despliegue: GitHub Actions con OIDC, sin perfil de publicación compartido.
- Protección de API: Microsoft Entra ID.
- SharePoint: Graph con `Sites.Selected`, limitado al sitio de facturas.
- Extractos: lectura de la primera hoja por la Function; los resultados operativos se guardan en SharePoint Lists.
- Secretos: identidad administrada y Key Vault cuando sea necesario; nunca Git ni chat.

## Recursos propuestos

```text
Tenant Microsoft 365 empresarial
├── Sitio privado: /sites/facturas
│   └── Biblioteca: Documentos
│       ├── Facturas/
│       └── Configuracion/RegistroFacturas.xlsx
└── Tabla Excel: tblFacturas

Azure
└── rg-facturas-copilot-dev
    ├── func-facturas-copilot-dev
    ├── cuenta de almacenamiento
    ├── Application Insights
    └── Key Vault
```

Los nombres son provisionales hasta que el cliente los confirme. El esquema Excel está en `deployment/excel-schema.json`.

## Bloqueo actual

La recepción y el archivado de PDF ya funcionan. Los tres ajustes operativos quedaron declarados como parámetros Bicep para sobrevivir a nuevos despliegues. Quedan pendientes los parámetros de negocio, la interfaz de revisión y la aceptación CA-01 a CA-21 completa.

## Información que debe proporcionar el cliente

### Acceso e infraestructura

- Tenant ID y dominio `*.onmicrosoft.com`.
- Suscripción Azure y permiso para crear recursos.
- Región Azure autorizada: preferencia inicial Spain Central o West Europe.
- Cuenta de desarrollo/servicio y responsables de las conexiones.
- Confirmación de licencias y alcance de Copilot, si se habilitan consultas asistidas.

### Microsoft 365

- Buzón y carpeta de entrada.
- URL del sitio SharePoint o autorización para crearlo.
- Biblioteca, carpetas, permisos, retención y versionado.
- Ubicación, propietarios y política de edición del libro de configuración, si se conserva como referencia.
- Confirmación de la región y capacidad de Document Intelligence.

### Reglas de negocio

- Formatos y tamaño máximo admitidos.
- Destino de presupuestos y otros documentos.
- Patrón definitivo del nombre PDF.
- Campos obligatorios, moneda y regla de vencimiento ausente.
- Clave/tolerancia de duplicados.
- Umbrales de confianza.
- Responsables y canal de excepciones.
- Volumen esperado e idiomas.

Estas decisiones se consolidarán contra el PRD vigente v4.

## Siguiente secuencia

1. Definir la interfaz de revisión para documentos desviados y excepciones sobre SharePoint Lists.
2. Completar la persistencia operativa de decisiones de conciliación.
3. Ejecutar la aceptación restante CA-01 a CA-21 y conservar evidencia.

## Comandos de comprobación

```powershell
npm test
npm run check:m365
git status --short --branch
```
