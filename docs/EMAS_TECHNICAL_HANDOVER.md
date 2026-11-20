# Manual técnico de continuidad EMAS

## Añadir columnas fiscales a RegistroFacturas

Este procedimiento crea las columnas necesarias antes de desplegar una versión de la aplicación que escriba nuevos datos fiscales. Debe realizarlo una cuenta con permiso para administrar listas en el sitio SharePoint de facturas.

Lista de destino:

https://grupmedicdental.sharepoint.com/sites/facturas/Lists/RegistroFacturas/AllItems.aspx

### Pasos

1. Abra el enlace anterior e inicie sesión con una cuenta autorizada del tenant DENTAL CATALUNYA.
2. En la esquina superior derecha, seleccione el engranaje de SharePoint y abra la configuración de la lista.
3. Seleccione **Crear columna**.
4. Cree la columna `IRPF` con estos valores:
   - Tipo: **Número**.
   - Decimales: **Automático**.
   - Obligatoria: **No**.
   - Valor predeterminado: vacío.
5. Repita el proceso para crear `TipoIRPF` con la misma configuración.
6. Vuelva a la lista y compruebe que ambas columnas aparecen disponibles para incorporarlas posteriormente a una vista si procede.

### Comprobación previa al despliegue

No se debe desplegar el cambio de IRPF hasta comprobar que existen exactamente las dos columnas siguientes en `RegistroFacturas`:

| Columna | Tipo | Uso previsto |
| --- | --- | --- |
| `IRPF` | Número | Importe de retención tal como figura en el documento, normalmente con signo negativo. |
| `TipoIRPF` | Número | Porcentaje de retención informado en el documento. |

La aplicación conserva el total declarado por la factura. Si una factura contiene IRPF y su IVA es cero, se desviará a revisión y no se archivará ni registrará automáticamente.
