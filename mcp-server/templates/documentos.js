/**
 * HTML para Recibo y Comprobante de pago (impresión / PDF vía Puppeteer).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Lee logo como data URI para PDF; preview en iframe puede usar /logo-lag.png vía Vite. */
export function loadLogoDataUri() {
  const logoPath = path.join(__dirname, '..', '..', 'public', 'logo-lag.png');
  try {
    if (!fs.existsSync(logoPath)) return '';
    const buf = fs.readFileSync(logoPath);
    return `data:image/png;base64,${buf.toString('base64')}`;
  } catch {
    return '';
  }
}

export function formatearMoneda(valor) {
  const n = Number(valor);
  if (Number.isNaN(n)) return '$ —';
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 2,
  }).format(n);
}

export function formatearFecha(fecha) {
  if (fecha == null || fecha === '') return '-';
  const s = String(fecha).trim();
  if (/^\d{1,2}\/\d{1,2}\/\d{4}/.test(s)) {
    const [d, m, y] = s.split(/[\/\s]/).filter(Boolean);
    if (d && m && y) return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
  }
  const date = fecha instanceof Date ? fecha : new Date(s);
  if (Number.isNaN(date.getTime())) return s || '-';
  return date.toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function escapeHtml(s) {
  if (s == null || s === '') return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function generarNumeroDocumento(tipo, id) {
  const prefix = tipo === 'recibo' ? 'REC' : 'PAGO';
  const numero = String(id).padStart(7, '0');
  return `${prefix}-${numero}`;
}

const DOC_STYLES = `
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: Arial, Helvetica, sans-serif;
      padding: 20px;
      color: #333;
    }
    .documento {
      max-width: 800px;
      margin: 0 auto;
      border: 2px solid #000;
      padding: 30px;
    }
    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 30px;
      padding-bottom: 20px;
      border-bottom: 3px solid #000;
    }
    .logo-container {
      background-color: #000;
      padding: 15px;
      border-radius: 8px;
      min-height: 60px;
      display: flex;
      align-items: center;
    }
    .logo { width: 200px; height: auto; display: block; }
    .logo-fallback {
      color: #fff;
      font-size: 14px;
      font-weight: bold;
      max-width: 200px;
    }
    .header-info { text-align: right; }
    .header-info h1 { font-size: 28px; margin-bottom: 5px; }
    .razon-membrete { font-size: 12px; color: #666; margin-bottom: 4px; }
    .numero-doc { font-size: 18px; color: #666; margin-bottom: 10px; }
    .fecha-emision { font-size: 14px; color: #666; }
    .seccion { margin-bottom: 25px; }
    .seccion h2 {
      background-color: #000;
      color: #fff;
      padding: 8px 12px;
      font-size: 16px;
      margin-bottom: 15px;
    }
    .seccion-content { padding-left: 15px; }
    .seccion-content p { margin-bottom: 8px; line-height: 1.6; }
    .monto-destacado {
      background-color: #f0f0f0;
      padding: 15px;
      border-left: 4px solid #000;
      margin: 20px 0;
    }
    .monto-destacado .label { font-size: 14px; color: #666; margin-bottom: 5px; }
    .monto-destacado .valor { font-size: 32px; font-weight: bold; color: #000; }
    .footer {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 2px solid #ccc;
      text-align: center;
      font-size: 12px;
      color: #666;
    }
    @media print {
      body { padding: 0; }
      .documento { border: none; max-width: 100%; }
    }
`;

/** @param {string} [logoSrc] data URI o vacío @param {boolean} [forPdf] si true y no hay logo, membrete solo texto (Puppeteer no resuelve /logo-lag.png) */
function logoBlock(logoSrc, forPdf = false) {
  if (logoSrc) {
    return `<div class="logo-container"><img src="${logoSrc}" alt="LAG Distribuciones" class="logo" /></div>`;
  }
  if (forPdf) {
    return `<div class="logo-container"><span class="logo-fallback" style="display:block;color:#fff;font-size:16px;font-weight:bold">LAG DISTRIBUCIONES</span></div>`;
  }
  return `<div class="logo-container">
    <img src="/logo-lag.png" alt="LAG Distribuciones" class="logo" />
  </div>`;
}

/** @param {object} transferencia fila NSFW_Transferencias (+ joins opcionales) */
export function templateRecibo(transferencia, { logoSrc = '', forPdf = false } = {}) {
  const id = transferencia.id;
  const numero = generarNumeroDocumento('recibo', id);
  const tipoOrigen = String(transferencia.TIPO_ORIGEN || '').toUpperCase();

  let destinatarioHTML = '';
  if (tipoOrigen === 'CLIENTE') {
    destinatarioHTML = `
      <p><strong>Código Cliente:</strong> ${escapeHtml(transferencia.COD_CLIENT)}</p>
      <p><strong>Razón Social:</strong> ${escapeHtml(transferencia.Cliente)}</p>`;
  } else if (tipoOrigen === 'FINANCIERA' || tipoOrigen === 'CLIENTE_FINANCIERO') {
    destinatarioHTML = `
      <p><strong>Código Cuenta:</strong> ${escapeHtml(transferencia.COD_CLIENT)}</p>
      <p><strong>Descripción:</strong> ${escapeHtml(transferencia.Cliente)}</p>`;
  } else {
    destinatarioHTML = `
      <p><strong>Código:</strong> ${escapeHtml(transferencia.COD_CLIENT)}</p>
      <p><strong>Descripción:</strong> ${escapeHtml(transferencia.Cliente)}</p>`;
  }

  const labelOrigen =
    tipoOrigen === 'CLIENTE'
      ? 'Comercial (GVA14)'
      : tipoOrigen === 'CLIENTE_FINANCIERO'
        ? 'Cliente Financiero (SBA01)'
        : tipoOrigen === 'FINANCIERA'
          ? 'Financiera (SBA01)'
          : escapeHtml(tipoOrigen || '-');

  const logoHtml = logoBlock(logoSrc, forPdf);

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Recibo ${escapeHtml(numero)}</title>
  <style>${DOC_STYLES}</style>
</head>
<body>
  <div class="documento">
    <div class="header">
      ${logoHtml}
      <div class="header-info">
        <div class="razon-membrete">LAG DISTRIBUCIONES</div>
        <h1>RECIBO</h1>
        <div class="numero-doc">${escapeHtml(numero)}</div>
        <div class="fecha-emision">Fecha de emisión: ${escapeHtml(formatearFecha(new Date()))}</div>
      </div>
    </div>

    <div class="seccion">
      <h2>RECIBIDO DE</h2>
      <div class="seccion-content">
        ${destinatarioHTML}
        <p><strong>Tipo de Origen:</strong> ${labelOrigen}</p>
      </div>
    </div>

    <div class="monto-destacado">
      <div class="label">MONTO RECIBIDO</div>
      <div class="valor">${escapeHtml(formatearMoneda(transferencia.Monto))}</div>
    </div>

    <div class="seccion">
      <h2>DATOS DE LA TRANSFERENCIA</h2>
      <div class="seccion-content">
        <p><strong>Código de Transferencia:</strong> ${escapeHtml(transferencia.CodigoTransferencia)}</p>
        <p><strong>Fecha de Comprobante:</strong> ${escapeHtml(formatearFecha(transferencia.FechaComprobante))}</p>
        <p><strong>Concepto:</strong> ${escapeHtml(transferencia.Concepto)}</p>
        <p><strong>Banco Origen:</strong> ${escapeHtml(transferencia.Banco)}</p>
      </div>
    </div>

    <div class="seccion">
      <h2>DATOS BANCARIOS DEL REMITENTE</h2>
      <div class="seccion-content">
        <p><strong>CUIT/CUIL:</strong> ${escapeHtml(transferencia.CUITOrigen)}</p>
        <p><strong>CBU:</strong> ${escapeHtml(transferencia.CBUOrigen)}</p>
        <p><strong>Cuenta:</strong> ${escapeHtml(transferencia.CtaOrigen)}</p>
        <p><strong>Titular:</strong> ${escapeHtml(transferencia.PersonaAsignada)}</p>
      </div>
    </div>

    <div class="footer">
      <p>Este documento certifica la recepción de la transferencia detallada</p>
      <p>LAG DISTRIBUCIONES</p>
    </div>
  </div>
</body>
</html>`;
}

export function templateComprobantePago(transferencia, destinoInfo, terceroInfo, { logoSrc = '', forPdf = false } = {}) {
  const id = transferencia.id;
  const numero = generarNumeroDocumento('pago', id);

  let destinatarioHTML = '';
  if (destinoInfo && (destinoInfo.destinos || destinoInfo.razon_social)) {
    destinatarioHTML = `
      <p><strong>Destino:</strong> ${escapeHtml(destinoInfo.destinos)}</p>
      <p><strong>Razón Social:</strong> ${escapeHtml(destinoInfo.razon_social)}</p>
      <p><strong>CUIT:</strong> ${escapeHtml(destinoInfo.cuit)}</p>
      ${destinoInfo.codigo_proveedor_tango ? `<p><strong>Código Tango:</strong> ${escapeHtml(destinoInfo.codigo_proveedor_tango)}</p>` : ''}`;
  } else {
    destinatarioHTML = `<p><strong>Destino (texto):</strong> ${escapeHtml(transferencia.Destino)}</p>`;
  }

  const asig = String(transferencia.destino_tipo || '').trim().toUpperCase();
  let tipoCuentaHTML = '';
  if (asig === 'PROPIA') {
    tipoCuentaHTML = `
      <div class="seccion">
        <h2>TIPO DE CUENTA</h2>
        <div class="seccion-content">
          <p><strong>Cuenta propia del proveedor</strong></p>
          ${destinoInfo?.banco ? `<p><strong>Banco:</strong> ${escapeHtml(destinoInfo.banco)}</p>` : ''}
          ${destinoInfo?.cbu ? `<p><strong>CBU:</strong> ${escapeHtml(destinoInfo.cbu)}</p>` : ''}
          ${destinoInfo?.numero_cuenta ? `<p><strong>Número de Cuenta:</strong> ${escapeHtml(destinoInfo.numero_cuenta)}</p>` : ''}
        </div>
      </div>`;
  } else if (asig === 'TERCERO' && terceroInfo) {
    tipoCuentaHTML = `
      <div class="seccion">
        <h2>TIPO DE CUENTA</h2>
        <div class="seccion-content">
          <p><strong>Cuenta de tercero</strong></p>
          <p><strong>Titular:</strong> ${escapeHtml(terceroInfo.nombre_tercero)}</p>
          <p><strong>CUIT:</strong> ${escapeHtml(terceroInfo.cuit_tercero)}</p>
          <p><strong>Banco:</strong> ${escapeHtml(terceroInfo.banco)}</p>
          <p><strong>CBU:</strong> ${escapeHtml(terceroInfo.cbu)}</p>
          ${terceroInfo.numero_cuenta ? `<p><strong>Número de Cuenta:</strong> ${escapeHtml(terceroInfo.numero_cuenta)}</p>` : ''}
        </div>
      </div>`;
  }

  const cuitBen = transferencia.CUITDestino || terceroInfo?.cuit_tercero;
  const cbuBen = transferencia.CBUDestino || terceroInfo?.cbu;
  const ctaBen = transferencia.CtaDestino || terceroInfo?.numero_cuenta;

  const logoHtml = logoBlock(logoSrc, forPdf);

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Comprobante de Pago ${escapeHtml(numero)}</title>
  <style>${DOC_STYLES}</style>
</head>
<body>
  <div class="documento">
    <div class="header">
      ${logoHtml}
      <div class="header-info">
        <div class="razon-membrete">LAG DISTRIBUCIONES</div>
        <h1>COMPROBANTE DE PAGO</h1>
        <div class="numero-doc">${escapeHtml(numero)}</div>
        <div class="fecha-emision">Fecha de emisión: ${escapeHtml(formatearFecha(new Date()))}</div>
      </div>
    </div>

    <div class="seccion">
      <h2>PAGO REALIZADO A</h2>
      <div class="seccion-content">${destinatarioHTML}</div>
    </div>

    ${tipoCuentaHTML}

    <div class="monto-destacado">
      <div class="label">MONTO PAGADO</div>
      <div class="valor">${escapeHtml(formatearMoneda(transferencia.Monto))}</div>
    </div>

    <div class="seccion">
      <h2>DATOS DE LA TRANSFERENCIA</h2>
      <div class="seccion-content">
        <p><strong>Código de Transferencia:</strong> ${escapeHtml(transferencia.CodigoTransferencia)}</p>
        <p><strong>Fecha de Comprobante:</strong> ${escapeHtml(formatearFecha(transferencia.FechaComprobante))}</p>
        <p><strong>Concepto:</strong> ${escapeHtml(transferencia.Concepto)}</p>
      </div>
    </div>

    <div class="seccion">
      <h2>DATOS BANCARIOS DEL BENEFICIARIO</h2>
      <div class="seccion-content">
        <p><strong>CUIT/CUIL:</strong> ${escapeHtml(cuitBen)}</p>
        <p><strong>CBU:</strong> ${escapeHtml(cbuBen)}</p>
        <p><strong>Cuenta:</strong> ${escapeHtml(ctaBen)}</p>
      </div>
    </div>

    <div class="footer">
      <p>Este documento certifica el pago realizado según los datos detallados</p>
      <p>LAG DISTRIBUCIONES</p>
    </div>
  </div>
</body>
</html>`;
}
