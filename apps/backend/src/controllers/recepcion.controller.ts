import type { Request, Response } from 'express';
import { z } from 'zod';
import { guardarRecepcion } from '../repositories/recepcion.repository';

// ── Esquema Zod ──────────────────────────────────────────────────────────────

const ItemSchema = z.object({
  cod_articu: z.string().min(1, 'cod_articu requerido'),
  series: z
    .array(z.string().min(1))
    .min(1, 'Cada artículo debe tener al menos una serie'),
});

const RecepcionSchema = z.object({
  cod_provee: z.string().min(1, 'cod_provee requerido'),
  nro_remito: z.string().min(1, 'nro_remito requerido'),
  fecha: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'fecha debe tener formato YYYY-MM-DD'),
  items: z
    .array(ItemSchema)
    .min(1, 'Se requiere al menos un artículo'),
});

// ── Handler ──────────────────────────────────────────────────────────────────

export async function postRecepcion(req: Request, res: Response): Promise<void> {
  // 1. Validar payload
  const parsed = RecepcionSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({
      error: 'Payload inválido',
      detalles: parsed.error.flatten().fieldErrors,
    });
    return;
  }

  // 2. Detectar series duplicadas dentro del mismo payload
  const allSeries = parsed.data.items.flatMap(i => i.series);
  const duplicadas = allSeries.filter((s, i) => allSeries.indexOf(s) !== i);
  if (duplicadas.length > 0) {
    res.status(400).json({
      error: 'Series duplicadas en el payload',
      duplicadas: [...new Set(duplicadas)],
    });
    return;
  }

  // 3. Guardar
  try {
    const result = await guardarRecepcion(parsed.data);
    res.status(201).json(result);
  } catch (err) {
    // El repositorio ya logueó el error; aquí solo enviamos el mensaje al cliente
    const msg = err instanceof Error ? err.message : 'Error interno';
    res.status(500).json({ error: msg });
  }
}
