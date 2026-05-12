# Implementación: Inserción en SBA04 y SBA05 junto a GVA12

## Archivos modificados

| Archivo | Tipo de cambio |
|---|---|
| `mcp-server/services/tangoIntegration.js` | Principal — lógica de inserción |
| `mcp-server/api.js` | Menor — log y respuesta JSON extendidos |

---

## Qué se hizo

### 1. Nueva función utilitaria `parseFecha`

Se agregó en `tangoIntegration.js` una función que convierte el string `'dd/MM/yyyy'`
(formato que devuelve la query SQL via `FORMAT(t.FECHA, 'dd/MM/yyyy')`) en un objeto
`Date` válido para usarlo como parámetro `sql.DateTime`.

```javascript
function parseFecha(fechaStr) {
  if (!fechaStr) return new Date();
  const parts = String(fechaStr).split('/');
  if (parts.length === 3) {
    const [dd, MM, yyyy] = parts;
    return new Date(parseInt(yyyy, 10), parseInt(MM, 10) - 1, parseInt(dd, 10));
  }
  const d = new Date(fechaStr);
  return isNaN(d.getTime()) ? new Date() : d;
}
```

---

### 2. Nuevos pasos dentro de la transacción

La función `registrarReciboEnGVA12` ya tenía 4 pasos (leer proximo, calcular NCOMP_IN_V,
insertar GVA12, actualizar proximo). Se extendió a 8 pasos:

#### PASO 4 — Calcular N_INTERNO para SBA04

```sql
SELECT ISNULL(MAX(N_INTERNO), 0) + 1 AS ni FROM SBA04
```

Mismo patrón que `NCOMP_IN_V` en GVA12: busca el último valor en la tabla y le suma 1.

#### PASO 5 — INSERT en SBA04 (capturando ID_SBA04)

SBA04 es la **cabecera del recibo bancario** (1 registro por recibo).

Campos dinámicos:

| Campo | Valor |
|---|---|
| `FECHA` / `FECHA_EMIS` | `transferencia.FECHA` (fecha de la transferencia) |
| `FECHA_ING` | Fecha y hora actuales |
| `HORA_ING` | Entero `HHMMSS` |
| `N_COMP` | Mismo valor calculado para GVA12 |
| `N_INTERNO` | `MAX(N_INTERNO) + 1` calculado en PASO 4 |
| `COD_GVA14` | `transferencia.COD_CLIENT` |
| `TOTAL_IMPORTE_CTE` / `TOTAL_IMPORTE_EXT` | `transferencia.Monto` |

Campos fijos relevantes:

| Campo | Valor |
|---|---|
| `COD_COMP` | `'REC'` |
| `CONCEPTO` | `'COBRANZA EN CTA CTE'` |
| `COTIZACION` | `10000000` |
| `CLASE` | `1` |
| `SITUACION` | `'N'` |
| `TERMINAL` | `'#ASTORCLI#DESKTOP-AL8R3OG'` |
| `USUARIO` | `'SUPERVISOR'` |
| `ID_SBA02` | `3` |
| `GENERA_ASIENTO` | `'S'` |
| `TIPO_COD_RELACIONADO` | `'C'` |
| `CN_ASTOR` | `'N'` |
| `TRANSFERENCIA_DEVOLUCION_CUPONES` | `'N'` |

Como SBA04 puede tener triggers de Tango (igual que GVA12), se usa
`OUTPUT INSERTED.ID_SBA04 INTO @idsSba04` para capturar el ID generado de forma fiable:

```sql
DECLARE @idsSba04 TABLE (ID_SBA04 INT);
INSERT INTO SBA04 (...) OUTPUT INSERTED.ID_SBA04 INTO @idsSba04 VALUES (...);
SELECT ID_SBA04 FROM @idsSba04;
```

#### PASO 6 y 7 — INSERT dos registros en SBA05 (par Debe/Haber)

SBA05 representa el **detalle contable de doble entrada** asociado a la cabecera SBA04.
Se insertan **2 registros en un único batch SQL**:

| | Registro 1 (Débito) | Registro 2 (Crédito) |
|---|---|---|
| `D_H` | `'D'` | `'H'` |
| `COD_CTA` | `1` | `31` |
| `RENGLON` | `1` | `0` |
| `ID_SBA01` | `1` | `11` |
| `CANT_MONE` | `monto` | `NULL` |
| `MONTO` | `monto` | `NULL` |
| `UNIDADES` | `monto` | `NULL` |
| `FECHA` | fecha transferencia | `NULL` |
| `LEYENDA` | `transferencia.PersonaAsignada` | `NULL` |
| `COD_GVA14` | `transferencia.COD_CLIENT` | `NULL` |
| `ID_SBA04` | ID obtenido en PASO 5 | ID obtenido en PASO 5 |
| `COTIZ_MONE` | `10000000` | `10000000` |
| `ID_SBA02` | `3` | `3` |

#### PASO 8 — UPDATE NSFW_proximo (reubicado)

El incremento del contador `NSFW_proximo` se **movió al final** de todos los INSERTs.
Antes estaba después de GVA12. Ahora se ejecuta solo si GVA12, SBA04 y SBA05 todos
insertaron correctamente — garantizando que el número no avanza ante cualquier fallo.

---

### 3. Atomicidad total

La transacción `sql.Transaction` ya existente cubre ahora los 8 pasos.
Si cualquier INSERT o SELECT falla, el bloque `catch` ejecuta `tx.rollback()` y
**ninguna de las tres tablas queda con datos parciales**.

```
BEGIN TRANSACTION
  ├── SELECT proximo (NSFW_proximo)
  ├── SELECT MAX(NCOMP_IN_V) (GVA12)
  ├── INSERT GVA12  → captura ID_GVA12
  ├── SELECT MAX(N_INTERNO) (SBA04)
  ├── INSERT SBA04  → captura ID_SBA04
  ├── INSERT SBA05 registro Debe (D)
  ├── INSERT SBA05 registro Haber (H)
  └── UPDATE NSFW_proximo + 1
COMMIT  ←  o ROLLBACK si cualquier paso falla
```

---

### 4. Retorno extendido de `registrarReciboEnGVA12`

Antes:
```javascript
return { nComp, ncompInV, idGva12 };
```

Ahora:
```javascript
return { nComp, ncompInV, idGva12, nInternoSba04, idSba04 };
```

---

### 5. Cambio en `api.js`

El endpoint `POST /api/transfers/:id/generar-recibo` ahora incluye los nuevos campos
en el log de servidor y en el JSON de respuesta:

```json
{
  "success": true,
  "message": "Recibo generado y registrado en Tango correctamente",
  "n_comp": "C0000300033685",
  "ncomp_in_v": 41234,
  "id_gva12": 98765,
  "id_sba04": 109446,
  "n_interno_sba04": 109446
}
```

---

## Logs esperados en consola (servidor) al generar un recibo

```
[GVA12] Próximo de NSFW_proximo: 33685 → N_COMP: "C0000300033685" (longitud: 14)
[GVA12] MAX(NCOMP_IN_V) actual: 41233 → NCOMP_IN_V nuevo: 41234
[GVA12] Insertando — COD_CLIENT="XXXXXX", N_COMP="C0000300033685" (14), NCOMP_IN_V=41234, IMPORTE=150000
[GVA12] ID obtenido via OUTPUT INTO: 98765
[SBA04] N_INTERNO calculado: 109446
[SBA04] ID obtenido via OUTPUT INTO: 109446
[SBA05] 2 registros insertados (D/H) para ID_SBA04: 109446
[GVA12] NSFW_proximo incrementado a 33686
[Tango] COMMIT OK — recibo C0000300033685 registrado | GVA12: 98765 | SBA04: 109446 (N_INTERNO: 109446) | SBA05: 2 registros
[API] Recibo registrado — N_COMP: C0000300033685, ID_GVA12: 98765, ID_SBA04: 109446, N_INTERNO_SBA04: 109446
```
