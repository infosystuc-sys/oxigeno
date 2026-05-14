import type { Request, Response } from 'express';
import { z } from 'zod';
import {
  guardarRemitoCliente,
  obtenerProximoRemito,
} from '../repositories/remito-cliente.repository';

const ItemSchema = z.object({
  cod_articu: z.string().min(1, 'cod_articu requerido'),
  series:     z.array(z.string().min(1)).min(1, 'Cada artículo debe tener al menos una serie'),
});

const RemitoClienteSchema = z.object({
  cod_client: z.string().min(1, 'cod_client requerido'),
  fecha:      z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'fecha debe tener formato YYYY-MM-DD'),
  items:      z.array(ItemSchema).min(1, 'Se requiere al menos un artículo'),
});

export async function getProximoRemito(_req: Request, res: Response): Promise<void> {
  try {
    const nro_comprobante = await obtenerProximoRemito();
    res.json({ nro_comprobante });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error interno';
    res.status(500).json({ error: msg });
  }
}

export async function postRemitoCliente(req: Request, res: Response): Promise<void> {
  const parsed = RemitoClienteSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ error: 'Payload inválido', detalles: parsed.error.flatten().fieldErrors });
    return;
  }

  const allSeries  = parsed.data.items.flatMap(i => i.series);
  const duplicadas = allSeries.filter((s, i) => allSeries.indexOf(s) !== i);
  if (duplicadas.length > 0) {
    res.status(400).json({ error: 'Series duplicadas en el payload', duplicadas: [...new Set(duplicadas)] });
    return;
  }

  try {
    const result = await guardarRemitoCliente(parsed.data);
    res.status(201).json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error interno';
    res.status(500).json({ error: msg });
  }
}
