import type { Request, Response } from 'express';
import { z } from 'zod';
import {
  buscarDepositos,
  obtenerProximoMovimiento,
  guardarMovimientoDeposito,
} from '../repositories/movimiento-depositos.repository';

const ItemSchema = z.object({
  cod_articu: z.string().min(1, 'cod_articu requerido'),
  series:     z.array(z.string().min(1)).min(1, 'Cada artículo debe tener al menos una serie'),
});

const MovimientoSchema = z.object({
  cod_origen:  z.string().min(1, 'cod_origen requerido'),
  cod_destino: z.string().min(1, 'cod_destino requerido'),
  fecha:       z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'fecha debe tener formato YYYY-MM-DD'),
  items:       z.array(ItemSchema).min(1, 'Se requiere al menos un artículo'),
});

// GET /api/movimiento-depositos/depositos?search=...
export async function getDepositos(req: Request, res: Response): Promise<void> {
  const search = (req.query.search as string | undefined) ?? '';
  if (search.length < 1) {
    res.status(400).json({ error: 'El parámetro search es requerido' });
    return;
  }
  try {
    const depositos = await buscarDepositos(search);
    res.json(depositos);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error interno';
    res.status(500).json({ error: msg });
  }
}

// GET /api/movimiento-depositos/proximo
export async function getProximoMovimiento(_req: Request, res: Response): Promise<void> {
  try {
    const nro_comprobante = await obtenerProximoMovimiento();
    res.json({ nro_comprobante });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error interno';
    res.status(500).json({ error: msg });
  }
}

// POST /api/movimiento-depositos
export async function postMovimientoDeposito(req: Request, res: Response): Promise<void> {
  const parsed = MovimientoSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ error: 'Payload inválido', detalles: parsed.error.flatten().fieldErrors });
    return;
  }

  if (parsed.data.cod_origen === parsed.data.cod_destino) {
    res.status(400).json({ error: 'El depósito origen y destino no pueden ser el mismo' });
    return;
  }

  // Unicidad por cod_articu:serie
  const allKeys    = parsed.data.items.flatMap(i => i.series.map(s => `${i.cod_articu}:${s}`));
  const duplicadas = allKeys.filter((k, i) => allKeys.indexOf(k) !== i);
  if (duplicadas.length > 0) {
    res.status(400).json({ error: 'Series duplicadas en el payload', duplicadas: [...new Set(duplicadas)] });
    return;
  }

  try {
    const result = await guardarMovimientoDeposito(parsed.data);
    res.status(201).json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error interno';
    res.status(500).json({ error: msg });
  }
}
