export interface PrintItem {
  cod_articu: string;
  descrip:    string;
  series:     string[];
}

export interface ComprobantePrintData {
  tipo:             'recepcion' | 'remito-cliente';
  nro_comprobante:  string;
  fecha:            string;   // YYYY-MM-DD
  entidad_cod:      string;
  entidad_nombre:   string;
  nro_remito_prov?: string;   // solo recepción
  items:            PrintItem[];
}

function escHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function imprimirComprobante(data: ComprobantePrintData): void {
  const totalSeries  = data.items.reduce((n, i) => n + i.series.length, 0);
  const titulo       = data.tipo === 'recepcion' ? 'Informe de Recepción' : 'Remito a Clientes';
  const entidadLabel = data.tipo === 'recepcion' ? 'Proveedor' : 'Cliente';
  const fechaDisplay = data.fecha.split('-').reverse().join('/');

  const itemsHtml = data.items.map(item => `
    <tr>
      <td class="mono small">${escHtml(item.cod_articu)}</td>
      <td>${escHtml(item.descrip)}</td>
      <td class="center bold">${item.series.length}</td>
      <td class="series-cell">${item.series.map(s => `<span class="serie-chip">${escHtml(s)}</span>`).join('')}</td>
    </tr>
  `).join('');

  const metaRemito = data.nro_remito_prov ? `
    <div class="meta-item">
      <div class="meta-label">Nro. Remito Proveedor</div>
      <div class="meta-value mono">${escHtml(data.nro_remito_prov)}</div>
    </div>` : '';

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>${titulo} ${escHtml(data.nro_comprobante)}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: Arial, Helvetica, sans-serif;
    font-size: 11px;
    color: #111;
    background: #fff;
    padding: 16mm 14mm;
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    padding-bottom: 10px;
    margin-bottom: 14px;
    border-bottom: 2px solid #083A82;
  }
  .header h1 { font-size: 18px; color: #083A82; font-weight: 700; }
  .header .subtitle { font-size: 9px; color: #888; margin-top: 3px; }

  .comp-box {
    border: 2px solid #083A82;
    border-radius: 4px;
    padding: 6px 14px;
    text-align: center;
    min-width: 160px;
  }
  .comp-box .label { font-size: 8px; text-transform: uppercase; letter-spacing: .06em; color: #666; }
  .comp-box .numero { font-family: 'Courier New', monospace; font-size: 15px; font-weight: 700; color: #083A82; margin-top: 2px; }

  .meta { display: flex; gap: 8px; margin-bottom: 14px; flex-wrap: wrap; }
  .meta-item { flex: 1; min-width: 120px; background: #f4f6fb; border: 1px solid #dde1eb; border-radius: 4px; padding: 7px 10px; }
  .meta-label { font-size: 8px; text-transform: uppercase; letter-spacing: .05em; color: #777; margin-bottom: 3px; }
  .meta-value { font-size: 12px; font-weight: 600; }

  table { width: 100%; border-collapse: collapse; margin-bottom: 14px; }
  thead tr { background: #083A82; }
  thead th { color: #fff; padding: 6px 8px; text-align: left; font-size: 9px; letter-spacing: .04em; font-weight: 600; }
  thead th.center { text-align: center; }
  tbody tr:nth-child(even) { background: #f4f6fb; }
  tbody td { padding: 5px 8px; border-bottom: 1px solid #e4e7ef; vertical-align: top; }

  .mono   { font-family: 'Courier New', monospace; }
  .small  { font-size: 10px; color: #555; }
  .bold   { font-weight: 700; }
  .center { text-align: center; }

  .series-cell { line-height: 1.9; }
  .serie-chip {
    display: inline-block;
    font-family: 'Courier New', monospace;
    font-size: 9px;
    background: #e8edf8;
    border: 1px solid #c5cde5;
    border-radius: 3px;
    padding: 1px 5px;
    margin: 1px 2px;
  }

  .totales { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
  .total-box { background: #083A82; color: #fff; border-radius: 4px; padding: 7px 16px; text-align: center; }
  .total-box .t-label { font-size: 8px; opacity: .8; text-transform: uppercase; letter-spacing: .06em; }
  .total-box .t-value { font-size: 22px; font-weight: 700; margin-top: 2px; }
  .print-info { font-size: 8px; color: #aaa; text-align: right; line-height: 1.6; }

  .footer-line {
    border-top: 1px solid #ddd;
    padding-top: 8px;
    display: flex;
    justify-content: space-between;
    font-size: 8px;
    color: #aaa;
  }

  @media print {
    body { padding: 8mm; }
    @page { size: A4 portrait; margin: 8mm; }
  }
</style>
</head>
<body>

<div class="header">
  <div>
    <h1>${titulo}</h1>
    <div class="subtitle">Oxigeno — Trazabilidad de Cilindros de Gases</div>
  </div>
  <div class="comp-box">
    <div class="label">Nro. Comprobante</div>
    <div class="numero">${escHtml(data.nro_comprobante)}</div>
  </div>
</div>

<div class="meta">
  <div class="meta-item">
    <div class="meta-label">Fecha</div>
    <div class="meta-value">${fechaDisplay}</div>
  </div>
  <div class="meta-item" style="flex:2">
    <div class="meta-label">${entidadLabel}</div>
    <div class="meta-value">
      ${escHtml(data.entidad_nombre)}
      <span style="font-weight:400;color:#888;font-size:10px">(${escHtml(data.entidad_cod)})</span>
    </div>
  </div>
  ${metaRemito}
</div>

<table>
  <thead>
    <tr>
      <th style="width:90px">Código</th>
      <th>Artículo</th>
      <th class="center" style="width:50px">Cant.</th>
      <th>N° de Series</th>
    </tr>
  </thead>
  <tbody>
    ${itemsHtml}
  </tbody>
</table>

<div class="totales">
  <div class="total-box">
    <div class="t-label">Total cilindros</div>
    <div class="t-value">${totalSeries}</div>
  </div>
  <div class="print-info">
    Impreso: ${new Date().toLocaleString('es-AR')}<br>
    Comprobante: ${escHtml(data.nro_comprobante)}
  </div>
</div>

<div class="footer-line">
  <span>Oxigeno App — Sistema de Trazabilidad de Cilindros</span>
  <span>${escHtml(data.nro_comprobante)} · ${fechaDisplay}</span>
</div>

<script>
  window.onload = function() { window.print(); };
  window.onafterprint = function() { window.close(); };
<\/script>
</body>
</html>`;

  const win = window.open('', '_blank');
  if (!win) {
    alert(
      'El navegador bloqueó la ventana de impresión.\n' +
      'Por favor permita las ventanas emergentes para este sitio e intente nuevamente.'
    );
    return;
  }
  win.document.write(html);
  win.document.close();
}
