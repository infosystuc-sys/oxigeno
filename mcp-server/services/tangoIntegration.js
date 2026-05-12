/**
 * tangoIntegration.js
 * Registra recibos en GVA12 (saldo en GVA14), SBA04 y SBA05 usando
 * numeración secuencial de NSFW_proximo (T_COMP = 'REC').
 *
 * N_COMP     → "C00003" + NSFW_proximo.proximo (8 dígitos)
 * NCOMP_IN_V → MAX(NCOMP_IN_V) de GVA12 + 1  (independiente de proximo)
 * SBA04      → 1 registro (cabecera del recibo bancario)
 * SBA05      → 2 registros (par Debe/Haber de doble entrada contable)
 */

import sql from 'mssql';

const PREFIJO_NCOMP = 'C00003';
const T_COMP = 'REC';

/**
 * Genera N_COMP: "C00003" + proximo rellenado a 8 dígitos.
 * Ej: proximo=1 → "C0000300000001", proximo=33684 → "C0000300033684"
 */
function formatearNComp(proximo) {
  const numeroRellenado = String(Number(proximo)).padStart(8, '0');
  const resultado = PREFIJO_NCOMP + numeroRellenado;
  if (resultado.length !== 14) {
    throw new Error(
      `N_COMP debe tener 14 caracteres exactos. Generó: "${resultado}" (${resultado.length} chars)`
    );
  }
  return resultado;
}

/**
 * Parsea una fecha en formato 'dd/MM/yyyy' a un objeto Date.
 * Si el formato no coincide intenta new Date() directo como fallback.
 */
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

/**
 * Devuelve un Date con hora 00:00:00.000 (solo fecha).
 * Acepta string 'dd/MM/yyyy', ISO, Date, o null/undefined (usa fallback).
 */
function soloFecha(valor, fallback = new Date()) {
  let d;
  if (!valor) {
    d = new Date(fallback);
  } else if (valor instanceof Date) {
    d = new Date(valor);
  } else {
    const str = String(valor);
    const partes = str.split('/');
    if (partes.length === 3) {
      const [dd, MM, yyyy] = partes;
      d = new Date(parseInt(yyyy, 10), parseInt(MM, 10) - 1, parseInt(dd, 10));
    } else {
      d = new Date(str);
      if (isNaN(d.getTime())) d = new Date(fallback);
    }
  }
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Registra un recibo en GVA12 (actualiza saldos en GVA14), SBA04 y SBA05, y avanza el numerador
 * en NSFW_proximo. Usa una transacción SQL para garantizar atomicidad:
 * si cualquier paso falla se hace rollback completo (GVA12, GVA14, SBA04, SBA05).
 *
 * @param {sql.ConnectionPool} pool  conexión activa
 * @param {object} transferencia     fila de NSFW_Transferencias (JOIN con destinos)
 * @returns {Promise<{nComp, ncompInV, idGva12, nInternoSba04, idSba04, insertóGVA12: boolean}>}
 */
export async function registrarReciboEnGVA12(pool, transferencia) {
  const tx = new sql.Transaction(pool);

  // ── PASO 0: Verificar REC_EMITIDO y leer TIPO_ORIGEN ──────────
  console.log('[Tango] > PASO 0: Verificando estado de emisión...');
  const verificacion = await pool
    .request()
    .input('id_verif', sql.Int, transferencia.id)
    .query(`
      SELECT REC_EMITIDO, TIPO_ORIGEN
      FROM NSFW_Transferencias
      WHERE id = @id_verif
    `);

  if (!verificacion.recordset.length) {
    throw new Error('PASO 0: Transferencia no encontrada');
  }

  const recEmitido = verificacion.recordset[0].REC_EMITIDO;
  const tipoOrigen = verificacion.recordset[0].TIPO_ORIGEN;

  if (recEmitido === 'S') {
    throw new Error('RECIBO_YA_EMITIDO');
  }

  const esCliente = tipoOrigen === 'CLIENTE';
  console.log(
    `[Tango] OK PASO 0: REC_EMITIDO=${recEmitido ?? 'NULL'}, TIPO_ORIGEN=${tipoOrigen}, insertaGVA12=${esCliente}`
  );

  try {
    await tx.begin();
    console.log('[Tango] Transaccion iniciada');

    // ── PASO 1: Leer proximo desde NSFW_proximo (para N_COMP) ──
    console.log('[Tango] > PASO 1: Leyendo proximo de NSFW_proximo (T_COMP=REC)...');
    let proximoNumero, nComp;
    try {
      const proximoResult = await tx
        .request()
        .input('tcomp', sql.VarChar(3), T_COMP)
        .query(`SELECT proximo FROM NSFW_proximo WHERE T_COMP = @tcomp`);

      if (!proximoResult.recordset.length) {
        throw new Error('No se encontro T_COMP=REC en NSFW_proximo');
      }
      proximoNumero = Number(proximoResult.recordset[0].proximo);
      nComp = formatearNComp(proximoNumero);
      console.log(`[Tango] OK PASO 1: proximo=${proximoNumero} -> N_COMP="${nComp}" (${nComp.length} chars)`);
    } catch (pasoErr) {
      console.error('[Tango] ERROR PASO 1:', pasoErr.message);
      throw pasoErr;
    }

    // ── PASO 2: Calcular NCOMP_IN_V = MAX(NCOMP_IN_V) de GVA12 + 1 ──
    console.log('[Tango] > PASO 2: Calculando MAX(NCOMP_IN_V) de GVA12...');
    let ncompInV;
    try {
      const maxResult = await tx
        .request()
        .query(`SELECT ISNULL(MAX(NCOMP_IN_V), 0) AS max_ncomp FROM GVA12`);
      const maxNcomp = maxResult.recordset[0].max_ncomp || 0;
      ncompInV = maxNcomp + 1;
      console.log(`[Tango] OK PASO 2: MAX(NCOMP_IN_V)=${maxNcomp} -> NCOMP_IN_V nuevo=${ncompInV}`);
    } catch (pasoErr) {
      console.error('[Tango] ERROR PASO 2:', pasoErr.message);
      throw pasoErr;
    }

    // ── Calcular valores compartidos por PASO 3 en adelante ──
    const ahora = new Date();
    const horaIngreso = parseInt(
      ahora.toTimeString().slice(0, 8).replace(/:/g, ''),
      10
    );
    const monto = Number(transferencia.Monto);
    if (isNaN(monto) || monto <= 0) {
      throw new Error(`Monto invalido: ${transferencia.Monto}`);
    }
    const codClient = String(transferencia.COD_CLIENT || '').trim();
    const fechaVacia = soloFecha('1800-01-01');
    const hoySinHora = soloFecha(new Date());
    const fechaEmisSinHora = soloFecha(transferencia.FECHA);

    // ── PASO 3: INSERT en GVA12 (solo si TIPO_ORIGEN = 'CLIENTE') ──
    // GVA12 tiene triggers de Tango. SCOPE_IDENTITY() devuelve NULL cuando
    // el trigger hace INSERTs propios. La única solución fiable es
    // OUTPUT INSERTED.col INTO @tabla_variable dentro del mismo batch SQL.
    let idGva12 = null;

    if (esCliente) {
      console.log(
        `[Tango] > PASO 3: INSERT en GVA12 — COD_CLIENT="${codClient}", N_COMP="${nComp}", NCOMP_IN_V=${ncompInV}, IMPORTE=${monto}...`
      );
      try {
      const insertResult = await tx
      .request()
      .input('cod_client', sql.VarChar(6), codClient || '')
      .input('fecha_emis', sql.DateTime, fechaEmisSinHora)
      .input('importe', sql.Decimal(18, 7), monto)
      .input('unidades', sql.Decimal(18, 7), monto)
      .input('n_comp', sql.VarChar(14), nComp)
      .input('ncomp_in_v', sql.Int, ncompInV)
      .input('fecha_ingreso', sql.DateTime, hoySinHora)
      .input('hora_ingreso', sql.Int, horaIngreso)
      .input('fecha_vacia', sql.DateTime, fechaVacia)
      .query(`
        DECLARE @ids TABLE (ID_GVA12 INT);

        INSERT INTO GVA12 (
          AFEC_STK,
          CANT_HOJAS,
          CENT_STK,
          CENT_COB,
          COD_CAJA,
          COD_VENDED,
          COND_VTA,
          CONTABILIZ,
          CONTFISCAL,
          COTIZ,
          DESC_PANT,
          ESTADO,
          EXPORTADO,
          FECHA_ANU,
          ID_CIERRE,
          IMPORTE_BO,
          IMPORTE_EX,
          IMPORTE_FL,
          IMPORTE_GR,
          IMPORTE_IN,
          IMPORTE_IV,
          IMP_TICK_N,
          IMP_TICK_P,
          LOTE,
          MON_CTE,
          NRO_DE_LIS,
          NRO_SUCURS,
          PORC_BONIF,
          PORC_PRO,
          PORC_REC,
          PORC_TICK,
          PROPINA,
          PROPINA_EX,
          PTO_VTA,
          REC_PANT,
          TALONARIO,
          TCOMP_IN_V,
          TICKET,
          TIPO_VEND,
          T_COMP,
          LOTE_ANU,
          PORC_INT,
          PORC_FLE,
          ESTADO_UNI,
          NUMERO_Z,
          HORA_COMP,
          SENIA,
          ID_TURNO,
          ID_TURNOX,
          ID_A_RENTA,
          CAICAE_VTO,
          DOC_ELECTR,
          SERV_DESDE,
          SERV_HASTA,
          CANT_IMP,
          AFEC_CIERR,
          CANT_MAIL,
          ULT_IMP,
          ULT_MAIL,
          REBAJA_DEB,
          SUCURS_SII,
          EXENTA,
          MOTIVO_DTE,
          IMPOR_EXT,
          CERRADO,
          IMP_BO_EXT,
          IMP_EX_EXT,
          IMP_FL_EXT,
          IMP_GR_EXT,
          IMP_IN_EXT,
          IMP_IV_EXT,
          IM_TIC_N_E,
          IM_TIC_P_E,
          UNIDAD_EXT,
          PROPIN_EXT,
          PRO_EX_EXT,
          REC_PAN_EX,
          DES_PAN_EX,
          RECARGO_PV,
          ID_ASIENTO_MODELO_GV,
          GENERA_ASIENTO,
          USUARIO_INGRESO,
          TERMINAL_INGRESO,
          FECHA_ULTIMA_MODIFICACION,
          HORA_ULTIMA_MODIFICACION,
          ID_PUESTO_CAJA,
          NCOMP_IN_ORIGEN,
          OBS_COMERC,
          OBSERVAC,
          LEYENDA_1,
          LEYENDA_2,
          LEYENDA_3,
          LEYENDA_4,
          LEYENDA_5,
          IMP_CIGARRILLOS,
          POR_CIGARRILLOS,
          ID_MOTIVO_NOTA_CREDITO,
          FECHA_DESCARGA_PDF,
          HORA_DESCARGA_PDF,
          USUARIO_DESCARGA_PDF,
          ID_DIRECCION_ENTREGA,
          ID_HISTORIAL_RENDICION,
          ID_NEXO_COBRANZAS_PAGO,
          TIPO_TRANSACCION_VENTA,
          TIPO_TRANSACCION_COMPRA,
          COMPROBANTE_CREDITO,
          ES_PAGO_MIXTO,
          EXPORTADO_LID_CT,
          NRO_SUCURSAL_DESTINO,
          CANT_WA,
          ULTIMO_ENVIO_WA,
          PAGO_MISMA_MONEDA_EXTRANJERA,
          CRC_SIRCIP,
          ESTADO_SIRCIP,
          EXCLUIDO_SIRCIP,
          COD_CLIENT,
          FECHA_EMIS,
          IMPORTE,
          UNIDADES,
          N_COMP,
          NCOMP_IN_V,
          FECHA_INGRESO,
          HORA_INGRESO
        )
        OUTPUT INSERTED.ID_GVA12 INTO @ids
        VALUES (
          '0',
          1,
          'N',
          'N',
          0,
          '1',
          0,
          0,
          0,
          1.0000000,
          0.0000000,
          'IMP',
          0,
          @fecha_vacia,
          0,
          0.0000000,
          0.0000000,
          0.0000000,
          0.0000000,
          0.0000000,
          0.0000000,
          0.0000000,
          0.0000000,
          0,
          1,
          0,
          0,
          0.0000000,
          0.0000000,
          0.0000000,
          0.0000000,
          0.0000000,
          0.0000000,
          0,
          0.0000000,
          2,
          'RC',
          'N',
          'V',
          'REC',
          0,
          0.0000000,
          0.0000000,
          'IMP',
          0,
          200552,
          0,
          0,
          0,
          0,
          @fecha_vacia,
          0,
          @fecha_vacia,
          @fecha_vacia,
          0,
          'N',
          0,
          @fecha_vacia,
          @fecha_vacia,
          1,
          0,
          0,
          0,
          0.0000000,
          0,
          0.0000000,
          0.0000000,
          0.0000000,
          0.0000000,
          0.0000000,
          0.0000000,
          0.0000000,
          0.0000000,
          0.0000000,
          0.0000000,
          0.0000000,
          0.0000000,
          0.0000000,
          0.0000000,
          NULL,
          'N',
          'SUPERVISOR',
          '#ASTORCLI#DESKTOP-AL8R3OG',
          @fecha_vacia,
          NULL,
          NULL,
          0,
          NULL,
          NULL,
          NULL,
          NULL,
          NULL,
          NULL,
          NULL,
          0.0000000,
          0.0000000,
          NULL,
          @fecha_vacia,
          NULL,
          NULL,
          NULL,
          NULL,
          NULL,
          0,
          0,
          'N',
          NULL,
          0,
          NULL,
          0,
          NULL,
          0,
          NULL,
          NULL,
          NULL,
          @cod_client,
          @fecha_emis,
          @importe,
          @unidades,
          @n_comp,
          @ncomp_in_v,
          @fecha_ingreso,
          @hora_ingreso
        );

        SELECT ID_GVA12 FROM @ids;
      `);

      idGva12 = insertResult.recordset?.[0]?.ID_GVA12 ?? null;
      if (!idGva12) {
        console.warn('[Tango] OK PASO 3: GVA12 insertado pero no se pudo leer ID_GVA12 (trigger interference). Continuando...');
      } else {
        console.log(`[Tango] OK PASO 3: GVA12 insertado — ID_GVA12=${idGva12}`);
      }
      } catch (pasoErr) {
        console.error('[Tango] ERROR PASO 3:', pasoErr.message);
        throw pasoErr;
      }
    } else {
      console.log(`[Tango] -- PASO 3: OMITIDO — TIPO_ORIGEN=${tipoOrigen} no requiere GVA12`);
    }

    // ── PASO 3b: UPDATE GVA14 (solo si TIPO_ORIGEN = 'CLIENTE') ──
    if (esCliente) {
      console.log(`[Tango] > PASO 3b: UPDATE GVA14 — COD_CLIENT="${codClient}", restando MONTO=${monto}...`);
      try {
      const gva14Result = await tx
        .request()
        .input('monto_gva14', sql.Decimal(18, 7), monto)
        .input('cod_client_gva14', sql.VarChar(6), codClient || '')
        .query(`
          UPDATE GVA14
          SET SALDO_CC   = SALDO_CC   - @monto_gva14,
              SALDO_CC_U = SALDO_CC_U - @monto_gva14
          WHERE COD_CLIENT = @cod_client_gva14
        `);

      const filasAfectadas = gva14Result.rowsAffected?.[0] ?? 0;

      if (filasAfectadas === 0) {
        throw new Error(`PASO 3b: No se encontro COD_CLIENT="${codClient}" en GVA14`);
      }

      console.log(`[Tango] OK PASO 3b: GVA14 actualizado — ${filasAfectadas} fila(s) afectadas`);
      } catch (pasoErr) {
        console.error('[Tango] ERROR PASO 3b (GVA14):', pasoErr.message);
        throw pasoErr;
      }
    } else {
      console.log(`[Tango] -- PASO 3b: OMITIDO — TIPO_ORIGEN=${tipoOrigen} no requiere GVA14`);
    }

    // ── PASO 4: Calcular N_INTERNO para SBA04 ──
    console.log('[Tango] > PASO 4: Calculando MAX(N_INTERNO) de SBA04...');
    let nInternoSba04;
    try {
      const r4 = await tx
        .request()
        .query(`SELECT ISNULL(MAX(N_INTERNO), 0) + 1 AS ni FROM SBA04`);
      nInternoSba04 = r4.recordset[0].ni;
      console.log(`[Tango] OK PASO 4: N_INTERNO calculado=${nInternoSba04}`);
    } catch (pasoErr) {
      console.error('[Tango] ERROR PASO 4:', pasoErr.message);
      throw pasoErr;
    }

    // ── PASO 5: Insertar cabecera en SBA04 (capturando ID_SBA04) ──
    // SBA04 puede tener triggers de Tango → usamos OUTPUT INTO @tabla_variable
    const fechaTransferencia = parseFecha(transferencia.FECHA);
    console.log(`[Tango] > PASO 5: INSERT en SBA04 — N_COMP="${nComp}", N_INTERNO=${nInternoSba04}, COD_GVA14="${codClient}", FECHA=${fechaTransferencia.toISOString()}, IMPORTE=${monto}...`);
    console.log('[Tango] PASO 5 — valores a insertar:', {
      N_COMP: nComp,
      N_INTERNO: nInternoSba04,
      COD_GVA14: codClient,
      FECHA: fechaTransferencia,
      FECHA_ING: ahora,
      HORA_ING: horaIngreso,
      TOTAL_IMPORTE_CTE: monto,
      TOTAL_IMPORTE_EXT: monto,
    });
    let idSba04;
    try {
      const r5 = await tx
      .request()
      .input('fecha',         sql.DateTime,      fechaTransferencia)
      .input('fecha_ing',     sql.DateTime,      ahora)
      .input('hora_ing',      sql.Int,           horaIngreso)
      .input('n_comp',        sql.VarChar(14),   nComp)
      .input('n_interno',     sql.Int,           nInternoSba04)
      .input('cod_gva14',     sql.NVarChar(50),  codClient)
      .input('total_importe', sql.Decimal(18, 7), monto)
      .query(`
        DECLARE @idsSba04 TABLE (ID_SBA04 INT);

        INSERT INTO SBA04 (
          FILLER, BARRA, CERRADO, CLASE, COD_COMP, CONCEPTO, COTIZACION,
          EXPORTADO, EXTERNO, FECHA, FECHA_ING, HORA_ING,
          N_COMP, N_INTERNO, PASE, SITUACION, TERMINAL, USUARIO,
          LOTE, LOTE_ANU, SUCUR_ORI, FECHA_ORI, C_COMP_ORI, N_COMP_ORI, BARRA_ORI,
          FECHA_EMIS, GENERA_ASIENTO,
          FECHA_ULTIMA_MODIFICACION, HORA_ULTIMA_MODIFICACION,
          USUA_ULTIMA_MODIFICACION, TERM_ULTIMA_MODIFICACION,
          ID_PUESTO_CAJA, ID_GVA81, ID_SBA02, ID_SBA02_C_COMP_ORI,
          COD_GVA14, COD_CPA01, ID_CODIGO_RELACION, ID_LEGAJO,
          OBSERVACIONES, TIPO_COD_RELACIONADO, CN_ASTOR, ID_MODELO_INGRESO_SB,
          TOTAL_IMPORTE_CTE, TOTAL_IMPORTE_EXT, TRANSFERENCIA_DEVOLUCION_CUPONES
        )
        OUTPUT INSERTED.ID_SBA04 INTO @idsSba04
        VALUES (
          '                    ', 0, 0, 1, 'REC', 'COBRANZA EN CTA CTE', 10000000,
          0, 1, @fecha, @fecha_ing, @hora_ing,
          @n_comp, @n_interno, 0, 'N', '#ASTORCLI#DESKTOP-AL8R3OG', 'SUPERVISOR',
          0, 0, 0, '1800-01-01', NULL, NULL, 0,
          @fecha, 'S',
          NULL, NULL, NULL, NULL,
          NULL, NULL, 3, NULL,
          @cod_gva14, NULL, NULL, NULL,
          NULL, 'C', 'N', NULL,
          @total_importe, @total_importe, 'N'
        );

        SELECT ID_SBA04 FROM @idsSba04;
      `);

      idSba04 = r5.recordset?.[0]?.ID_SBA04 ?? null;
      if (!idSba04) {
        console.warn('[Tango] OK PASO 5: SBA04 insertado pero no se pudo leer ID_SBA04 (trigger interference). Continuando...');
      } else {
        console.log(`[Tango] OK PASO 5: SBA04 insertado — ID_SBA04=${idSba04}`);
      }
    } catch (pasoErr) {
      console.error('[Tango] ERROR PASO 5:', pasoErr.message);
      throw pasoErr;
    }

    // ── PASO 6 y 7: Insertar par Debe/Haber en SBA05 ──
    // Dos registros en el mismo batch SQL usando el ID_SBA04 recién obtenido.
    // SBA05 puede tener triggers de Tango; como no necesitamos recuperar PKs
    // no usamos OUTPUT INTO, pero el batch falla completo si hay error.
    const leyenda = String(transferencia.PersonaAsignada ?? '').trim();
    console.log(`[Tango] > PASO 6-7: INSERT en SBA05 (Debe D + Haber H) — ID_SBA04=${idSba04}, N_COMP="${nComp}", LEYENDA="${leyenda}", IMPORTE=${monto}...`);
    console.log('[Tango] PASO 6 — valores SBA05 Debe:', {
      D_H: 'D', COD_CTA: 1, RENGLON: 1, ID_SBA01: 1,
      ID_SBA04: idSba04, CANT_MONE: monto, MONTO: monto,
      UNIDADES: monto, FECHA: fechaTransferencia,
      LEYENDA: leyenda, COD_GVA14: codClient,
    });
    console.log('[Tango] PASO 7 — valores SBA05 Haber:', {
      D_H: 'H', COD_CTA: 31, RENGLON: 0, ID_SBA01: 11,
      ID_SBA04: idSba04, CANT_MONE: null, MONTO: null,
      UNIDADES: null, FECHA: fechaTransferencia, LEYENDA: null, COD_GVA14: null,
    });
    try {
      await tx
      .request()
      .input('cant_mone',  sql.Decimal(18, 7), monto)
      .input('fecha',      sql.DateTime,       fechaTransferencia)
      .input('leyenda',    sql.NVarChar(100),  leyenda)
      .input('monto',      sql.Decimal(18, 7), monto)
      .input('n_comp',     sql.VarChar(14),    nComp)
      .input('unidades',   sql.Decimal(18, 7), monto)
      .input('cod_gva14',  sql.NVarChar(50),   codClient)
      .input('id_sba04',   sql.Int,            idSba04)
      .query(`
        -- Registro 1: Débito (D) — cuenta 1, ID_SBA01=1
        INSERT INTO SBA05 (
          FILLER, BARRA, CANT_MONE, CHEQUES, CLASE, COD_COMP, COD_CTA,
          COD_OPERAC, CONCILIADO, COTIZ_MONE, D_H, EFECTIVO,
          FECHA, FECHA_CONC, LEYENDA, MONTO, N_COMP, RENGLON,
          UNIDADES, VA_DIRECTO, ID_SBA02, ID_GVA81,
          CONC_EFTV, F_CONC_EFT, COMENTARIO, COMENTARIO_EFT,
          COD_GVA14, COD_CPA01, ID_CODIGO_RELACION, ID_LEGAJO,
          TIPO_COD_RELACIONADO, ID_TIPO_COTIZACION, ID_SBA11,
          ID_SBA04, ID_SBA01
        ) VALUES (
          NULL, 0, @cant_mone, 0.0, 1, 'REC', 1,
          NULL, 0, 10000000, 'D', 0.0,
          @fecha, '1800-01-01', @leyenda, @monto, @n_comp, 1,
          @unidades, 'N', 3, NULL,
          0, '1800-01-01', NULL, NULL,
          @cod_gva14, NULL, NULL, NULL,
          'C', NULL, NULL,
          @id_sba04, 1
        );

        -- Registro 2: Crédito (H) — cuenta 31, ID_SBA01=11
        INSERT INTO SBA05 (
          FILLER, BARRA, CANT_MONE, CHEQUES, CLASE, COD_COMP, COD_CTA,
          COD_OPERAC, CONCILIADO, COTIZ_MONE, D_H, EFECTIVO,
          FECHA, FECHA_CONC, LEYENDA, MONTO, N_COMP, RENGLON,
          UNIDADES, VA_DIRECTO, ID_SBA02, ID_GVA81,
          CONC_EFTV, F_CONC_EFT, COMENTARIO, COMENTARIO_EFT,
          COD_GVA14, COD_CPA01, ID_CODIGO_RELACION, ID_LEGAJO,
          TIPO_COD_RELACIONADO, ID_TIPO_COTIZACION, ID_SBA11,
          ID_SBA04, ID_SBA01
        ) VALUES (
          NULL, 0, NULL, 0.0, 1, 'REC', 31,
          NULL, 0, 10000000, 'H', 0.0,
          @fecha, '1800-01-01', NULL, NULL, @n_comp, 0,
          NULL, 'N', 3, NULL,
          0, '1800-01-01', NULL, NULL,
          NULL, NULL, NULL, NULL,
          'C', NULL, NULL,
          @id_sba04, 11
        );
      `);

      console.log(`[Tango] OK PASO 6-7: SBA05 2 registros (D/H) insertados para ID_SBA04=${idSba04}`);
    } catch (pasoErr) {
      console.error('[Tango] ERROR PASO 6-7 (SBA05):', pasoErr.message);
      throw pasoErr;
    }

    // ── PASO 8: Incrementar proximo en NSFW_proximo ──
    console.log('[Tango] > PASO 8: UPDATE NSFW_proximo...');
    try {
      await tx
        .request()
        .input('tcomp', sql.VarChar(3), T_COMP)
        .query(`UPDATE NSFW_proximo SET proximo = proximo + 1 WHERE T_COMP = @tcomp`);
      console.log(`[Tango] OK PASO 8: NSFW_proximo incrementado a ${proximoNumero + 1}`);
    } catch (pasoErr) {
      console.error('[Tango] ERROR PASO 8:', pasoErr.message);
      throw pasoErr;
    }

    // ── PASO 8b: Marcar REC_EMITIDO = 'S' en NSFW_Transferencias ──
    console.log('[Tango] > PASO 8b: Marcando REC_EMITIDO=S...');
    try {
      const marcaResult = await tx
        .request()
        .input('id_marca', sql.Int, transferencia.id)
        .query(`
          UPDATE NSFW_Transferencias
          SET REC_EMITIDO = 'S'
          WHERE id = @id_marca
        `);

      const filasMarca = marcaResult.rowsAffected?.[0] ?? 0;

      if (filasMarca === 0) {
        throw new Error('PASO 8b: No se pudo actualizar REC_EMITIDO');
      }

      console.log('[Tango] OK PASO 8b: REC_EMITIDO marcado como S');
    } catch (pasoErr) {
      console.error('[Tango] ERROR PASO 8b:', pasoErr.message);
      throw pasoErr;
    }

    // ── COMMIT ──
    await tx.commit();
    console.log(
      `[Tango] COMMIT OK — recibo ${nComp} | GVA12: ${idGva12} | SBA04: ${idSba04} (N_INTERNO: ${nInternoSba04}) | SBA05: 2 registros`
    );

    return {
      nComp,
      ncompInV,
      idGva12,
      nInternoSba04,
      idSba04,
      insertóGVA12: esCliente,
    };
  } catch (err) {
    console.error('[Tango] ERROR EN TRANSACCION:', err.message);
    console.error('[Tango] Stack:', err.stack);
    try {
      await tx.rollback();
      console.log('[Tango] Rollback ejecutado');
    } catch (rbErr) {
      console.error('[Tango] Error en rollback:', rbErr.message);
    }
    throw err;
  }
}
