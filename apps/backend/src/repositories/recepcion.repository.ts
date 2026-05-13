/**
 * recepcion.repository.ts
 *
 * Escribe un comprobante de recepción de cilindros en las tablas de Tango.
 *
 * Flujo:
 *  1. Consultar STA11 y STA_ARTICULO_UNIDAD_COMPRA por cada artículo (fuera de la tx)
 *  2. Iniciar transacción
 *  3. Leer CPA56.PROXIMO (TALONARIO=11) con UPDLOCK → N_COMP de STA14
 *  4. Calcular NCOMP_IN_S: MAX(STA14.NCOMP_IN_S WHERE TCOMP='RP')+1 con UPDLOCK+HOLDLOCK
 *  5. INSERT sta14 (OUTPUT → tabla temporal por triggers)  → captura ID_STA14
 *  6. Por cada artículo:
 *       INSERT sta20  (con FECHA_MOV, ID_MEDIDA_COMPRA, UNIDAD_MEDIDA_SELECCIONADA)
 *       Por cada serie:
 *         UPSERT sta06  — maestro de números de serie
 *         INSERT sta07  — movimiento de número de serie
 *  7. Incrementar CPA56.PROXIMO
 *  8. COMMIT
 */
import { getPool, sql } from '../config/db';
import type { PostRecepcionPayload, RecepcionResponse } from '@oxigeno/shared-types';

const COD_DEP    = '30';
const ESTADO_MOV = 'P';
const TCOMP      = 'RP';

// ─────────────────────────────────────────────────────────────────────────────
// Paso 1a: consultar STA11
// ─────────────────────────────────────────────────────────────────────────────

interface Sta11Data {
  ID_STA11:             number;
  ID_MEDIDA_STOCK:      number;
  ID_MEDIDA_STOCK_2:    number;
  ID_MEDIDA_VENTAS:     number;
  EQUIVALENCIA_STOCK_2: number;
}

async function consultarSta11(codArticu: string): Promise<Sta11Data> {
  const pool = await getPool();
  const res  = await pool.request()
    .input('cod', sql.VarChar(15), codArticu)
    .query<Sta11Data>(`
      SELECT
        ID_STA11,
        ID_MEDIDA_STOCK,
        ID_MEDIDA_STOCK_2,
        ID_MEDIDA_VENTAS,
        EQUIVALENCIA_STOCK_2
      FROM sta11 WITH (NOLOCK)
      WHERE COD_ARTICU = @cod
    `);

  if (res.recordset.length === 0) {
    throw new Error(`Artículo '${codArticu}' no encontrado en STA11`);
  }
  return res.recordset[0];
}

// ─────────────────────────────────────────────────────────────────────────────
// Paso 1b: consultar STA_ARTICULO_UNIDAD_COMPRA
// ─────────────────────────────────────────────────────────────────────────────

interface UnidadCompraData {
  ID_MEDIDA_COMPRA: number;
}

async function consultarUnidadCompra(idSta11: number): Promise<UnidadCompraData> {
  const pool = await getPool();
  const res  = await pool.request()
    .input('id_sta11', sql.Int, idSta11)
    .query<UnidadCompraData>(`
      SELECT ID_MEDIDA_COMPRA
      FROM STA_ARTICULO_UNIDAD_COMPRA WITH (NOLOCK)
      WHERE ID_STA11 = @id_sta11
    `);

  if (res.recordset.length === 0) {
    throw new Error(`No se encontró unidad de compra para ID_STA11=${idSta11} en STA_ARTICULO_UNIDAD_COMPRA`);
  }
  return res.recordset[0];
}

// ─────────────────────────────────────────────────────────────────────────────
// Paso 3: leer CPA56.PROXIMO para N_COMP (con UPDLOCK)
// ─────────────────────────────────────────────────────────────────────────────

async function leerCpa56(req: sql.Request): Promise<string> {
  const res = await req
    .input('talonario', sql.Int, 11)
    .query<{ PROXIMO: string }>(`
      SELECT PROXIMO
      FROM CPA56 WITH (UPDLOCK)
      WHERE TALONARIO = @talonario
    `);

  if (res.recordset.length === 0) {
    throw new Error('No se encontró el talonario 11 en CPA56');
  }
  return res.recordset[0].PROXIMO;
}

// ─────────────────────────────────────────────────────────────────────────────
// Paso 7: incrementar CPA56.PROXIMO
// ─────────────────────────────────────────────────────────────────────────────

async function incrementarCpa56(req: sql.Request): Promise<void> {
  await req.query(`
    UPDATE CPA56
    SET PROXIMO = RIGHT('00000000' + CAST(CAST(PROXIMO AS INT) + 1 AS VARCHAR(10)), 8)
    WHERE TALONARIO = @talonario
  `);
  // @talonario ya fue declarado en leerCpa56() sobre el mismo Request
}

// ─────────────────────────────────────────────────────────────────────────────
// Paso 4: calcular NCOMP_IN_S desde MAX de STA14
// ─────────────────────────────────────────────────────────────────────────────

async function leerNroComp(req: sql.Request): Promise<string> {
  const res = await req
    .input('tc_tipo', sql.VarChar(2), TCOMP)
    .query<{ PROXIMO: number }>(`
      SELECT ISNULL(MAX(CAST(NCOMP_IN_S AS INT)), 0) + 1 AS PROXIMO
      FROM sta14 WITH (UPDLOCK, HOLDLOCK)
      WHERE TCOMP_IN_S = @tc_tipo
    `);

  return String(res.recordset[0].PROXIMO).padStart(8, '0');
}

// ─────────────────────────────────────────────────────────────────────────────
// Paso 5: encabezado sta14 — retorna ID_STA14
// ─────────────────────────────────────────────────────────────────────────────

async function insertarEncabezado(
  req:     sql.Request,
  nroComp: string,
  nComp:   string,
  payload: PostRecepcionPayload,
): Promise<number> {
  const now         = new Date();
  const horaIngreso = parseInt(
    String(now.getHours()).padStart(2, '0') +
    String(now.getMinutes()).padStart(2, '0') +
    String(now.getSeconds()).padStart(2, '0'),
    10
  );

  req.input('h_tcomp',       sql.VarChar(2),    TCOMP);
  req.input('h_tcomp_ex',    sql.VarChar(3),    'REM');
  req.input('h_ncomp_in_s',  sql.VarChar(8),    nroComp);
  req.input('h_ncomp',       sql.VarChar(14),   nComp);
  req.input('h_fecha',       sql.Date,          new Date(payload.fecha));
  req.input('h_fecha_ing',   sql.DateTime,      now);
  req.input('h_provee',      sql.VarChar(6),    payload.cod_provee);
  req.input('h_remito',      sql.VarChar(14),   payload.nro_remito.substring(0, 14));
  req.input('h_estado',      sql.VarChar(1),    ESTADO_MOV);
  req.input('h_deposi',      sql.VarChar(2),    COD_DEP);
  req.input('h_cotiz',       sql.Decimal(18,4), 1);
  req.input('h_filler',      sql.VarChar(10),   'PEND.SWD');
  req.input('h_mon_cte',     sql.Bit,           1);
  req.input('h_motivo',      sql.VarChar(1),    'C');
  req.input('h_talonario',   sql.Int,           11);
  req.input('h_usuario',     sql.VarChar(20),   'SUPERVISOR');
  req.input('h_hora',        sql.Int,           horaIngreso);
  req.input('h_usr_ing',     sql.VarChar(20),   'SUPERVISOR');
  req.input('h_terminal',    sql.VarChar(20),   'APLICACION');

  // OUTPUT directo no funciona en tablas con triggers — se usa tabla temporal
  const result = await req.query<{ ID_STA14: number }>(`
    DECLARE @tmp TABLE (ID_STA14 INT);
    INSERT INTO sta14 (
      TCOMP_IN_S,  T_COMP,       NCOMP_IN_S,
      N_COMP,      FECHA_MOV,    FECHA_INGRESO,
      COD_PRO_CL,  N_REMITO,     ESTADO_MOV,
      COD_DEPOSI,  NRO_SUCURS,   COTIZ,
      FILLER,      MON_CTE,      MOTIVO_REM,
      TALONARIO,   USUARIO,      HORA_INGRESO,
      USUARIO_INGRESO,           TERMINAL_INGRESO
    )
    OUTPUT INSERTED.ID_STA14 INTO @tmp
    VALUES (
      @h_tcomp,    @h_tcomp_ex,  @h_ncomp_in_s,
      @h_ncomp,    @h_fecha,     @h_fecha_ing,
      @h_provee,   @h_remito,    @h_estado,
      @h_deposi,   0,            @h_cotiz,
      @h_filler,   @h_mon_cte,   @h_motivo,
      @h_talonario, @h_usuario,  @h_hora,
      @h_usr_ing,                @h_terminal
    );
    SELECT ID_STA14 FROM @tmp;
  `);

  return result.recordset[0].ID_STA14;
}

// ─────────────────────────────────────────────────────────────────────────────
// Paso 6a: renglón sta20
// ─────────────────────────────────────────────────────────────────────────────

async function insertarRenglon(
  req:             sql.Request,
  nroComp:         string,
  nroRenglon:      number,
  codArticu:       string,
  tubos:           number,
  idSta14:         number,
  fechaMov:        string,
  sta11:           Sta11Data,
  idMedidaCompra:  number,
): Promise<void> {
  const s         = `_r${nroRenglon}`;
  const cantKilos = tubos * sta11.EQUIVALENCIA_STOCK_2;

  req.input(`r_ncomp${s}`,       sql.VarChar(8),     nroComp);
  req.input(`r_rengl${s}`,       sql.Int,            nroRenglon);
  req.input(`r_articu${s}`,      sql.VarChar(15),    codArticu);
  req.input(`r_fecha${s}`,       sql.Date,           new Date(fechaMov));
  req.input(`r_cant${s}`,        sql.Decimal(18, 4), cantKilos);
  req.input(`r_cant2${s}`,       sql.Decimal(18, 4), tubos);
  req.input(`r_cantpend${s}`,    sql.Decimal(18, 4), cantKilos);
  req.input(`r_cantpend2${s}`,   sql.Decimal(18, 4), tubos);
  req.input(`r_equi${s}`,        sql.Decimal(18, 4), 1);
  req.input(`r_canequiv${s}`,    sql.Decimal(18, 4), 1);
  req.input(`r_idmed${s}`,       sql.Int,            sta11.ID_MEDIDA_STOCK);
  req.input(`r_idmed2${s}`,      sql.Int,            sta11.ID_MEDIDA_STOCK_2);
  req.input(`r_idmedv${s}`,      sql.Int,            sta11.ID_MEDIDA_VENTAS);
  req.input(`r_idmedc${s}`,      sql.Int,            idMedidaCompra);
  req.input(`r_idsta11${s}`,     sql.Int,            sta11.ID_STA11);
  req.input(`r_idsta14${s}`,     sql.Int,            idSta14);

  await req.query(`
    INSERT INTO sta20 (
      TCOMP_IN_S,  NCOMP_IN_S,       N_RENGL_S,
      COD_ARTICU,  FECHA_MOV,
      CANTIDAD,    CANTIDAD_2,
      CANT_PEND,   CANT_PEND_2,
      EQUIVALENC,  CAN_EQUI_V,
      COD_DEPOSI,  TIPO_MOV,
      ID_MEDIDA_STOCK,    ID_MEDIDA_STOCK_2,  ID_MEDIDA_VENTAS,
      ID_MEDIDA_COMPRA,   UNIDAD_MEDIDA_SELECCIONADA,
      ID_STA11,    ID_STA14
    ) VALUES (
      '${TCOMP}',  @r_ncomp${s},     @r_rengl${s},
      @r_articu${s}, @r_fecha${s},
      @r_cant${s}, @r_cant2${s},
      @r_cantpend${s}, @r_cantpend2${s},
      @r_equi${s}, @r_canequiv${s},
      '${COD_DEP}', 'E',
      @r_idmed${s},  @r_idmed2${s},  @r_idmedv${s},
      @r_idmedc${s}, 'C',
      @r_idsta11${s}, @r_idsta14${s}
    )
  `);
}

// ─────────────────────────────────────────────────────────────────────────────
// Paso 6b: maestro de series sta06
// ─────────────────────────────────────────────────────────────────────────────

async function upsertSerie(
  req:       sql.Request,
  codArticu: string,
  nroSerie:  string,
  idx:       number,
): Promise<void> {
  const s = `_s${idx}`;
  req.input(`s_articu${s}`, sql.VarChar(15), codArticu);
  req.input(`s_serie${s}`,  sql.VarChar(30), nroSerie);
  req.input(`s_deposi${s}`, sql.VarChar(2),  COD_DEP);

  const existe = await req.query<{ n: number }>(`
    SELECT COUNT(1) AS n
    FROM sta06
    WHERE COD_ARTICU = @s_articu${s}
      AND N_SERIE    = @s_serie${s}
  `);

  if (existe.recordset[0].n === 0) {
    await req.query(`
      INSERT INTO sta06 (COD_ARTICU, N_SERIE, COD_DEPOSI, DESC1, DESC2)
      VALUES (@s_articu${s}, @s_serie${s}, @s_deposi${s}, '', '')
    `);
  } else {
    await req.query(`
      UPDATE sta06
      SET COD_DEPOSI = @s_deposi${s}
      WHERE COD_ARTICU = @s_articu${s}
        AND N_SERIE    = @s_serie${s}
    `);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Paso 6c: movimiento de serie sta07
// ─────────────────────────────────────────────────────────────────────────────

async function insertarMovimientoSerie(
  req:        sql.Request,
  nroComp:    string,
  nroRenglon: number,
  codArticu:  string,
  nroSerie:   string,
  idx:        number,
): Promise<void> {
  const s = `_m${idx}`;
  req.input(`m_ncomp${s}`,  sql.VarChar(8),  nroComp);
  req.input(`m_rengl${s}`,  sql.Int,         nroRenglon);
  req.input(`m_articu${s}`, sql.VarChar(15), codArticu);
  req.input(`m_serie${s}`,  sql.VarChar(30), nroSerie);
  req.input(`m_deposi${s}`, sql.VarChar(2),  COD_DEP);

  await req.query(`
    INSERT INTO sta07 (
      TCOMP_IN_S, NCOMP_IN_S, N_RENGL_S,
      COD_ARTICU, N_SERIE,    COD_DEPOSI
    ) VALUES (
      '${TCOMP}', @m_ncomp${s}, @m_rengl${s},
      @m_articu${s}, @m_serie${s}, @m_deposi${s}
    )
  `);
}

// ─────────────────────────────────────────────────────────────────────────────
// Función pública
// ─────────────────────────────────────────────────────────────────────────────

export async function guardarRecepcion(
  payload: PostRecepcionPayload,
): Promise<RecepcionResponse> {

  // ── 1. Consultar STA11 y STA_ARTICULO_UNIDAD_COMPRA (fuera de la transacción)
  const sta11Map        = new Map<string, Sta11Data>();
  const unidadCompraMap = new Map<string, number>();  // cod_articu → ID_MEDIDA_COMPRA

  for (const item of payload.items) {
    const sta11 = await consultarSta11(item.cod_articu);
    sta11Map.set(item.cod_articu, sta11);

    const compra = await consultarUnidadCompra(sta11.ID_STA11);
    unidadCompraMap.set(item.cod_articu, compra.ID_MEDIDA_COMPRA);
  }

  const pool        = await getPool();
  const transaction = new sql.Transaction(pool);

  try {
    await transaction.begin();
    const req = new sql.Request(transaction);

    // ── 3. Leer CPA56.PROXIMO con UPDLOCK → N_COMP ──────────────────────────
    const proximoCpa56 = await leerCpa56(req);
    const nComp        = ' 00000' + proximoCpa56;   // 6 + 8 = 14 chars

    // ── 4. Calcular NCOMP_IN_S desde MAX de STA14 ───────────────────────────
    const nroComp = await leerNroComp(req);

    // ── 5. Encabezado sta14 → captura ID_STA14 ──────────────────────────────
    const idSta14 = await insertarEncabezado(req, nroComp, nComp, payload);

    let serieIdx = 0;

    // ── 6. Renglones, series y movimientos ───────────────────────────────────
    for (let r = 0; r < payload.items.length; r++) {
      const item           = payload.items[r];
      const nroRenglon     = r + 1;
      const sta11          = sta11Map.get(item.cod_articu)!;
      const idMedidaCompra = unidadCompraMap.get(item.cod_articu)!;
      const tubos          = item.series.length;

      await insertarRenglon(
        req, nroComp, nroRenglon, item.cod_articu,
        tubos, idSta14, payload.fecha, sta11, idMedidaCompra,
      );

      for (const nroSerie of item.series) {
        await upsertSerie(req, item.cod_articu, nroSerie, serieIdx);
        await insertarMovimientoSerie(req, nroComp, nroRenglon, item.cod_articu, nroSerie, serieIdx);
        serieIdx++;
      }
    }

    // ── 7. Incrementar CPA56.PROXIMO ─────────────────────────────────────────
    await incrementarCpa56(req);

    // ── 8. Confirmar ─────────────────────────────────────────────────────────
    await transaction.commit();

    return {
      success:         true,
      nro_comprobante: nroComp,
      message:         `Recepción guardada. Comprobante ${TCOMP}-${nroComp}`,
    };
  } catch (err) {
    console.error('[recepcion] Error en transacción:', err);
    try { await transaction.rollback(); } catch { /* ya abortada */ }
    throw err;
  }
}
