import type { Request, Response } from 'express';
import { z } from 'zod';
import {
  guardarRemitoCliente,
  obtenerProximoRemito,
  validarSerie,
} from '../repositories/remito-cliente.repository';

const ItemSchema = z.object({
  cod_articu: z.string().min(1, 'cod_articu requerido'),
  series:     z.array(z.string().min(1)).min(1, 'Cada artículo debe tener al menos una serie'),
});

const RemitoClienteSchema = z.object({
  cod_client:     z.string().min(1, 'cod_client requerido'),
  fecha:          z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'fecha debe tener formato YYYY-MM-DD'),
  items:          z.array(ItemSchema).min(1, 'Se requiere al menos un artículo'),
  envases_vacios: z.array(ItemSchema).optional(),
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

export async function getValidarSerie(req: Request, res: Response): Promise<void> {
  const { cod_articu, n_serie } = req.query as { cod_articu?: string; n_serie?: string };

  if (!cod_articu || !n_serie) {
    res.status(400).json({ error: 'cod_articu y n_serie son requeridos' });
    return;
  }

  try {
    const resultado = await validarSerie(cod_articu.trim(), n_serie.trim());
    res.json(resultado);
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

  // Unicidad por cod_articu + serie (la misma serie puede existir para artículos distintos)
  // Incluye envases vacíos en la verificación
  const keysItems  = parsed.data.items.flatMap(i => i.series.map(s => `${i.cod_articu}:${s}`));
  const keysVacios = (parsed.data.envases_vacios ?? []).flatMap(i => i.series.map(s => `${i.cod_articu}:${s}`));
  const allKeys    = [...keysItems, ...keysVacios];
  const duplicadas = allKeys.filter((k, i) => allKeys.indexOf(k) !== i);
  if (duplicadas.length > 0) {
    res.status(400).json({ error: 'Series duplicadas en el payload', duplicadas: [...new Set(duplicadas)] });
    return;
  }

  // Validar que envases vacíos coincidan por artículo con cilindros llenos
  const llenosByArt = new Map<string, number>();
  for (const it of parsed.data.items) {
    llenosByArt.set(it.cod_articu, (llenosByArt.get(it.cod_articu) ?? 0) + it.series.length);
  }
  const vaciosByArt = new Map<string, number>();
  for (const it of (parsed.data.envases_vacios ?? [])) {
    vaciosByArt.set(it.cod_articu, (vaciosByArt.get(it.cod_articu) ?? 0) + it.series.length);
  }
  const desbalance: { cod_articu: string; llenos: number; vacios: number }[] = [];
  const codArticus = new Set<string>([...llenosByArt.keys(), ...vaciosByArt.keys()]);
  for (const c of codArticus) {
    const l = llenosByArt.get(c) ?? 0;
    const v = vaciosByArt.get(c) ?? 0;
    if (l !== v) desbalance.push({ cod_articu: c, llenos: l, vacios: v });
  }
  if (desbalance.length > 0) {
    res.status(400).json({
      error: 'La cantidad de envases vacíos debe coincidir con la de cilindros llenos para cada artículo',
      desbalance,
    });
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
