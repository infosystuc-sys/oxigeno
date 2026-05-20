import { getPool, sql } from '../config/db';
import type {
  ComprobanteRecepcion,
  ComprobanteRemito,
  ComprobanteMovimiento,
  ComprobanteDetalle,
  DetalleArticulo,
  TrazabilidadSerie,
  MovimientoSerie,
} from '@oxigeno/shared-types';

// ─── Discriminadores de tipo por prefijo de N_COMP ───────────────────────────
// Recepción:              N_COMP LIKE ' 00000%'  (espacio + 00000)
// Remito a cliente:       N_COMP LIKE 'R00009%'
// Transferencia depósitos: N_COMP LIKE ' 90003%'  (TCOMP_IN_S='TI')

// ─── Recepciones ─────────────────────────────────────────────────────────────

export async function listarRecepciones(opts: {
  fecha_desde?:  string;
  fecha_hasta?:  string;
  cod_proveedor?: string;
  cod_articulo?:  string;
}): Promise<ComprobanteRecepcion[]> {
  const pool = await getPool();
  const req  = pool.request();

  req.input('fecha_desde',   sql.Date,       opts.fecha_desde   ?? null);
  req.input('fecha_hasta',   sql.Date,       opts.fecha_hasta   ?? null);
  req.input('cod_proveedor', sql.NVarChar(50), opts.cod_proveedor ? `%${opts.cod_proveedor}%` : null);
  req.input('cod_articulo',  sql.NVarChar(50), opts.cod_articulo  ? `%${opts.cod_articulo}%`  : null);

  const { recordset } = await req.query<ComprobanteRecepcion>(`
    SELECT
      s14.ID_STA14                                          AS id_sta14,
      RTRIM(s14.NCOMP_IN_S)                                 AS ncomp_in_s,
      RTRIM(s14.N_COMP)                                     AS n_comp,
      CONVERT(VARCHAR(10), s14.FECHA_INGRESO, 23)           AS fecha,
      RTRIM(s14.COD_PRO_CL)                                 AS cod_proveedor,
      ISNULL(RTRIM(p.NOM_PROVEE), '')                       AS nombre_proveedor,
      COUNT(DISTINCT RTRIM(s20.COD_ARTICU))                 AS total_articulos,
      COUNT(DISTINCT RTRIM(s7.N_SERIE))                     AS total_series
    FROM STA14 s14 WITH (NOLOCK)
    LEFT JOIN cpa01 p   WITH (NOLOCK) ON RTRIM(p.COD_PROVEE)  = RTRIM(s14.COD_PRO_CL)
    LEFT JOIN STA20 s20 WITH (NOLOCK) ON s20.ID_STA14         = s14.ID_STA14
    LEFT JOIN STA07 s7  WITH (NOLOCK)
      ON  s7.TCOMP_IN_S = s14.TCOMP_IN_S
      AND s7.NCOMP_IN_S = s14.NCOMP_IN_S
    WHERE s14.N_COMP LIKE ' 00000%'
      AND (@fecha_desde   IS NULL OR CAST(s14.FECHA_INGRESO AS DATE) >= @fecha_desde)
      AND (@fecha_hasta   IS NULL OR CAST(s14.FECHA_INGRESO AS DATE) <= @fecha_hasta)
      AND (@cod_proveedor IS NULL
            OR RTRIM(s14.COD_PRO_CL) LIKE @cod_proveedor
            OR RTRIM(p.NOM_PROVEE)   LIKE @cod_proveedor)
      AND (@cod_articulo  IS NULL OR EXISTS (
            SELECT 1 FROM STA20 x WITH (NOLOCK)
            WHERE x.ID_STA14 = s14.ID_STA14
              AND RTRIM(x.COD_ARTICU) LIKE @cod_articulo))
    GROUP BY
      s14.ID_STA14, s14.NCOMP_IN_S, s14.N_COMP,
      s14.FECHA_INGRESO, s14.COD_PRO_CL, p.NOM_PROVEE
    ORDER BY s14.FECHA_INGRESO DESC, s14.ID_STA14 DESC
  `);

  return recordset;
}

// ─── Remitos a clientes ───────────────────────────────────────────────────────

export async function listarRemitos(opts: {
  fecha_desde?: string;
  fecha_hasta?: string;
  cod_cliente?: string;
  cod_articulo?: string;
}): Promise<ComprobanteRemito[]> {
  const pool = await getPool();
  const req  = pool.request();

  req.input('fecha_desde',  sql.Date,       opts.fecha_desde ?? null);
  req.input('fecha_hasta',  sql.Date,       opts.fecha_hasta ?? null);
  req.input('cod_cliente',  sql.NVarChar(50), opts.cod_cliente  ? `%${opts.cod_cliente}%`  : null);
  req.input('cod_articulo', sql.NVarChar(50), opts.cod_articulo ? `%${opts.cod_articulo}%` : null);

  const { recordset } = await req.query<ComprobanteRemito>(`
    SELECT
      s14.ID_STA14                                          AS id_sta14,
      RTRIM(s14.NCOMP_IN_S)                                 AS ncomp_in_s,
      RTRIM(s14.N_COMP)                                     AS n_comp,
      CONVERT(VARCHAR(10), s14.FECHA_INGRESO, 23)           AS fecha,
      RTRIM(s14.COD_PRO_CL)                                 AS cod_cliente,
      ISNULL(RTRIM(c.RAZON_SOCI), '')                       AS nombre_cliente,
      COUNT(DISTINCT RTRIM(s20.COD_ARTICU))                 AS total_articulos,
      COUNT(DISTINCT RTRIM(s7.N_SERIE))                     AS total_series
    FROM STA14 s14 WITH (NOLOCK)
    LEFT JOIN gva14 c   WITH (NOLOCK) ON RTRIM(c.COD_CLIENT) = RTRIM(s14.COD_PRO_CL)
    LEFT JOIN STA20 s20 WITH (NOLOCK) ON s20.ID_STA14        = s14.ID_STA14
    LEFT JOIN STA07 s7  WITH (NOLOCK)
      ON  s7.TCOMP_IN_S = s14.TCOMP_IN_S
      AND s7.NCOMP_IN_S = s14.NCOMP_IN_S
    WHERE s14.N_COMP LIKE 'R00009%'
      AND (@fecha_desde  IS NULL OR CAST(s14.FECHA_INGRESO AS DATE) >= @fecha_desde)
      AND (@fecha_hasta  IS NULL OR CAST(s14.FECHA_INGRESO AS DATE) <= @fecha_hasta)
      AND (@cod_cliente  IS NULL
            OR RTRIM(s14.COD_PRO_CL) LIKE @cod_cliente
            OR RTRIM(c.RAZON_SOCI)   LIKE @cod_cliente)
      AND (@cod_articulo IS NULL OR EXISTS (
            SELECT 1 FROM STA20 x WITH (NOLOCK)
            WHERE x.ID_STA14 = s14.ID_STA14
              AND RTRIM(x.COD_ARTICU) LIKE @cod_articulo))
    GROUP BY
      s14.ID_STA14, s14.NCOMP_IN_S, s14.N_COMP,
      s14.FECHA_INGRESO, s14.COD_PRO_CL, c.RAZON_SOCI
    ORDER BY s14.FECHA_INGRESO DESC, s14.ID_STA14 DESC
  `);

  return recordset;
}

// ─── Movimientos entre depósitos ──────────────────────────────────────────────

export async function listarMovimientos(opts: {
  fecha_desde?:  string;
  fecha_hasta?:  string;
  cod_deposito?: string;
  cod_articulo?: string;
}): Promise<ComprobanteMovimiento[]> {
  const pool = await getPool();
  const req  = pool.request();

  req.input('fecha_desde',  sql.Date,       opts.fecha_desde  ?? null);
  req.input('fecha_hasta',  sql.Date,       opts.fecha_hasta  ?? null);
  req.input('cod_deposito', sql.NVarChar(20), opts.cod_deposito ? `%${opts.cod_deposito}%` : null);
  req.input('cod_articulo', sql.NVarChar(50), opts.cod_articulo ? `%${opts.cod_articulo}%` : null);

  const { recordset } = await req.query<ComprobanteMovimiento>(`
    SELECT
      s14.ID_STA14                                                        AS id_sta14,
      RTRIM(s14.NCOMP_IN_S)                                               AS ncomp_in_s,
      RTRIM(s14.N_COMP)                                                   AS n_comp,
      CONVERT(VARCHAR(10), s14.FECHA_INGRESO, 23)                         AS fecha,
      RTRIM(s14.COD_DEPOSI)                                               AS cod_origen,
      ISNULL(RTRIM(ori.NOMBRE_SUC), RTRIM(s14.COD_DEPOSI))               AS nombre_origen,
      ISNULL(
        MAX(CASE WHEN RTRIM(s20.TIPO_MOV) = 'E' THEN RTRIM(s20.COD_DEPOSI) END),
        ''
      )                                                                   AS cod_destino,
      ISNULL(
        MAX(CASE WHEN RTRIM(s20.TIPO_MOV) = 'E' THEN RTRIM(dst.NOMBRE_SUC) END),
        ''
      )                                                                   AS nombre_destino,
      COUNT(DISTINCT RTRIM(s20.COD_ARTICU))                               AS total_articulos,
      COUNT(DISTINCT RTRIM(s7.N_SERIE))                                   AS total_series
    FROM STA14 s14 WITH (NOLOCK)
    LEFT JOIN STA22 ori WITH (NOLOCK) ON RTRIM(ori.COD_SUCURS) = RTRIM(s14.COD_DEPOSI)
    LEFT JOIN STA20 s20 WITH (NOLOCK) ON s20.ID_STA14          = s14.ID_STA14
    LEFT JOIN STA22 dst WITH (NOLOCK)
      ON RTRIM(dst.COD_SUCURS) = RTRIM(s20.COD_DEPOSI)
     AND RTRIM(s20.TIPO_MOV)  = 'E'
    LEFT JOIN STA07 s7  WITH (NOLOCK)
      ON  s7.TCOMP_IN_S = s14.TCOMP_IN_S
      AND s7.NCOMP_IN_S = s14.NCOMP_IN_S
    WHERE s14.N_COMP LIKE ' 90003%'
      AND (@fecha_desde  IS NULL OR CAST(s14.FECHA_INGRESO AS DATE) >= @fecha_desde)
      AND (@fecha_hasta  IS NULL OR CAST(s14.FECHA_INGRESO AS DATE) <= @fecha_hasta)
      AND (@cod_deposito IS NULL
            OR RTRIM(s14.COD_DEPOSI) LIKE @cod_deposito
            OR EXISTS (
              SELECT 1 FROM STA20 x WITH (NOLOCK)
              JOIN STA22 dx WITH (NOLOCK) ON RTRIM(dx.COD_SUCURS) = RTRIM(x.COD_DEPOSI)
              WHERE x.ID_STA14 = s14.ID_STA14
                AND RTRIM(x.TIPO_MOV) = 'E'
                AND (RTRIM(x.COD_DEPOSI) LIKE @cod_deposito
                  OR RTRIM(dx.NOMBRE_SUC) LIKE @cod_deposito)))
      AND (@cod_articulo IS NULL OR EXISTS (
            SELECT 1 FROM STA20 x WITH (NOLOCK)
            WHERE x.ID_STA14 = s14.ID_STA14
              AND RTRIM(x.COD_ARTICU) LIKE @cod_articulo))
    GROUP BY
      s14.ID_STA14, s14.NCOMP_IN_S, s14.N_COMP,
      s14.FECHA_INGRESO, s14.COD_DEPOSI, ori.NOMBRE_SUC
    ORDER BY s14.FECHA_INGRESO DESC, s14.ID_STA14 DESC
  `);

  return recordset;
}

// ─── Detalle de comprobante ───────────────────────────────────────────────────

export async function obtenerDetalle(idSta14: number): Promise<ComprobanteDetalle> {
  const pool = await getPool();

  const [headerRes, rowsRes] = await Promise.all([
    pool.request()
      .input('id', sql.Int, idSta14)
      .query<{ id_sta14: number; n_comp: string }>(`
        SELECT ID_STA14 AS id_sta14, RTRIM(N_COMP) AS n_comp
        FROM STA14 WITH (NOLOCK) WHERE ID_STA14 = @id
      `),

    pool.request()
      .input('id', sql.Int, idSta14)
      .query<{ cod_articu: string; descrip: string; n_serie: string | null }>(`
        SELECT DISTINCT
          RTRIM(s20.COD_ARTICU)          AS cod_articu,
          ISNULL(RTRIM(s11.DESCRIPCIO), '') AS descrip,
          RTRIM(s7.N_SERIE)              AS n_serie
        FROM STA20 s20 WITH (NOLOCK)
        LEFT JOIN STA11 s11 WITH (NOLOCK)
          ON RTRIM(s11.COD_ARTICU) = RTRIM(s20.COD_ARTICU)
        LEFT JOIN STA07 s7 WITH (NOLOCK)
          ON  s7.TCOMP_IN_S = s20.TCOMP_IN_S
          AND s7.NCOMP_IN_S = s20.NCOMP_IN_S
          AND s7.N_RENGL_S  = s20.N_RENGL_S
        WHERE s20.ID_STA14 = @id
        ORDER BY cod_articu, n_serie
      `),
  ]);

  // Group series by article
  const artMap = new Map<string, DetalleArticulo>();
  for (const row of rowsRes.recordset) {
    if (!artMap.has(row.cod_articu)) {
      artMap.set(row.cod_articu, { cod_articu: row.cod_articu, descrip: row.descrip, series: [] });
    }
    if (row.n_serie) artMap.get(row.cod_articu)!.series.push(row.n_serie);
  }

  const h = headerRes.recordset[0];
  return {
    id_sta14: h?.id_sta14 ?? idSta14,
    n_comp:   h?.n_comp   ?? '',
    items:    Array.from(artMap.values()),
  };
}

// ─── Trazabilidad de serie ────────────────────────────────────────────────────

export async function trazabilidadSerie(nSerie: string): Promise<TrazabilidadSerie | null> {
  const pool = await getPool();

  // Todas las filas de sta06 para esta serie (una por artículo)
  const artRes = await pool.request()
    .input('serie', sql.NVarChar(30), nSerie)
    .query<{
      cod_articu: string; descrip: string;
      cod_deposi_actual: string; deposito_actual_nombre: string;
    }>(`
      SELECT
        RTRIM(s6.COD_ARTICU)                                         AS cod_articu,
        ISNULL(RTRIM(s11.DESCRIPCIO), '')                            AS descrip,
        RTRIM(s6.COD_DEPOSI)                                         AS cod_deposi_actual,
        ISNULL(RTRIM(s22.NOMBRE_SUC), RTRIM(s6.COD_DEPOSI))         AS deposito_actual_nombre
      FROM STA06 s6 WITH (NOLOCK)
      LEFT JOIN STA11 s11 WITH (NOLOCK) ON RTRIM(s11.COD_ARTICU) = RTRIM(s6.COD_ARTICU)
      LEFT JOIN STA22 s22 WITH (NOLOCK) ON RTRIM(s22.COD_SUCURS) = RTRIM(s6.COD_DEPOSI)
      WHERE RTRIM(s6.N_SERIE) = @serie
      ORDER BY s6.COD_ARTICU
    `);

  if (artRes.recordset.length === 0) return null;

  // Todos los movimientos de esta serie, incluyendo cod_articu para agrupar
  const histRes = await pool.request()
    .input('serie', sql.NVarChar(30), nSerie)
    .query<MovimientoSerie & { cod_articu: string }>(`
      SELECT
        RTRIM(s7.COD_ARTICU)                                           AS cod_articu,
        RTRIM(s14.N_COMP)                                              AS n_comp,
        CASE
          WHEN RTRIM(s14.TCOMP_IN_S) = 'RP' THEN 'Recepción'
          WHEN RTRIM(s14.TCOMP_IN_S) = 'RE' THEN 'Remito a Cliente'
          WHEN RTRIM(s14.TCOMP_IN_S) = 'TI' THEN 'Movimiento entre Depósitos'
          ELSE 'Otro'
        END                                                            AS tipo_movimiento,
        CONVERT(VARCHAR(10), s14.FECHA_INGRESO, 23)                    AS fecha,
        RTRIM(s14.COD_PRO_CL)                                         AS entidad_cod,
        CASE
          WHEN RTRIM(s14.TCOMP_IN_S) = 'RP' THEN ISNULL(RTRIM(prov.NOM_PROVEE), '')
          WHEN RTRIM(s14.TCOMP_IN_S) = 'RE' THEN ISNULL(RTRIM(cli.RAZON_SOCI), '')
          ELSE ''
        END                                                            AS entidad_nombre,
        RTRIM(s7.COD_DEPOSI)                                          AS cod_deposi,
        ISNULL(RTRIM(dep.NOMBRE_SUC), RTRIM(s7.COD_DEPOSI))           AS deposito_nombre
      FROM STA07 s7 WITH (NOLOCK)
      JOIN STA14 s14 WITH (NOLOCK)
        ON  s14.TCOMP_IN_S = s7.TCOMP_IN_S
        AND s14.NCOMP_IN_S = s7.NCOMP_IN_S
      LEFT JOIN STA22 dep  WITH (NOLOCK) ON RTRIM(dep.COD_SUCURS)  = RTRIM(s7.COD_DEPOSI)
      LEFT JOIN cpa01 prov WITH (NOLOCK) ON RTRIM(prov.COD_PROVEE) = RTRIM(s14.COD_PRO_CL)
                                        AND RTRIM(s14.TCOMP_IN_S)  = 'RP'
      LEFT JOIN gva14 cli  WITH (NOLOCK) ON RTRIM(cli.COD_CLIENT)  = RTRIM(s14.COD_PRO_CL)
                                        AND RTRIM(s14.TCOMP_IN_S)  = 'RE'
      WHERE RTRIM(s7.N_SERIE) = @serie
      ORDER BY s7.COD_ARTICU, s14.FECHA_INGRESO ASC, s7.N_RENGL_S ASC
    `);

  // Agrupar historial por artículo
  const histMap = new Map<string, MovimientoSerie[]>();
  for (const row of histRes.recordset) {
    if (!histMap.has(row.cod_articu)) histMap.set(row.cod_articu, []);
    histMap.get(row.cod_articu)!.push({
      n_comp:          row.n_comp,
      tipo_movimiento: row.tipo_movimiento,
      fecha:           row.fecha,
      entidad_cod:     row.entidad_cod,
      entidad_nombre:  row.entidad_nombre,
      cod_deposi:      row.cod_deposi,
      deposito_nombre: row.deposito_nombre,
    });
  }

  return {
    n_serie: nSerie,
    rutas: artRes.recordset.map(art => ({
      cod_articu:             art.cod_articu,
      descrip:                art.descrip,
      cod_deposi_actual:      art.cod_deposi_actual,
      deposito_actual_nombre: art.deposito_actual_nombre,
      historial:              histMap.get(art.cod_articu) ?? [],
    })),
  };
}
