import type { Request, Response } from 'express';
import { obtenerGases } from '../repositories/articulos.repository';

export async function getArticulosGases(_req: Request, res: Response): Promise<void> {
  try {
    const data = await obtenerGases();
    res.json(data);
  } catch (err) {
    console.error('[articulos]', err);
    res.status(500).json({ error: 'Error al obtener artículos' });
  }
}
