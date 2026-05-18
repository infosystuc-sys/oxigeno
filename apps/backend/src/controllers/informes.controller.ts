import type { Request, Response } from 'express';
import {
  listarRecepciones,
  listarRemitos,
  listarMovimientos,
  obtenerDetalle,
  trazabilidadSerie,
} from '../repositories/informes.repository';

export async function getRecepciones(req: Request, res: Response) {
  try {
    const { fecha_desde, fecha_hasta, cod_proveedor, cod_articulo } = req.query as Record<string, string>;
    const data = await listarRecepciones({
      fecha_desde:   fecha_desde   || undefined,
      fecha_hasta:   fecha_hasta   || undefined,
      cod_proveedor: cod_proveedor || undefined,
      cod_articulo:  cod_articulo  || undefined,
    });
    res.json(data);
  } catch (err) {
    console.error('informes/recepciones:', err);
    res.status(500).json({ error: 'Error al consultar recepciones' });
  }
}

export async function getRemitos(req: Request, res: Response) {
  try {
    const { fecha_desde, fecha_hasta, cod_cliente, cod_articulo } = req.query as Record<string, string>;
    const data = await listarRemitos({
      fecha_desde:  fecha_desde  || undefined,
      fecha_hasta:  fecha_hasta  || undefined,
      cod_cliente:  cod_cliente  || undefined,
      cod_articulo: cod_articulo || undefined,
    });
    res.json(data);
  } catch (err) {
    console.error('informes/remitos:', err);
    res.status(500).json({ error: 'Error al consultar remitos' });
  }
}

export async function getMovimientos(req: Request, res: Response) {
  try {
    const { fecha_desde, fecha_hasta, cod_deposito, cod_articulo } = req.query as Record<string, string>;
    const data = await listarMovimientos({
      fecha_desde:  fecha_desde  || undefined,
      fecha_hasta:  fecha_hasta  || undefined,
      cod_deposito: cod_deposito || undefined,
      cod_articulo: cod_articulo || undefined,
    });
    res.json(data);
  } catch (err) {
    console.error('informes/movimientos:', err);
    res.status(500).json({ error: 'Error al consultar movimientos' });
  }
}

export async function getDetalle(req: Request, res: Response) {
  try {
    const idSta14 = parseInt(req.params.id, 10);
    if (isNaN(idSta14)) return res.status(400).json({ error: 'ID inválido' });
    const data = await obtenerDetalle(idSta14);
    res.json(data);
  } catch (err) {
    console.error('informes/detalle:', err);
    res.status(500).json({ error: 'Error al consultar detalle' });
  }
}

export async function getSerie(req: Request, res: Response) {
  try {
    const nSerie = req.params.serie?.trim();
    if (!nSerie) return res.status(400).json({ error: 'Serie requerida' });
    const data = await trazabilidadSerie(nSerie);
    if (!data) return res.status(404).json({ error: 'Serie no encontrada' });
    res.json(data);
  } catch (err) {
    console.error('informes/serie:', err);
    res.status(500).json({ error: 'Error al consultar serie' });
  }
}
