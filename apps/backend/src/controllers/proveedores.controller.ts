import type { Request, Response } from 'express';
import { buscarProveedores } from '../repositories/proveedores.repository';

export async function getProveedores(req: Request, res: Response): Promise<void> {
  const search = String(req.query.search ?? '');

  try {
    const data = await buscarProveedores(search);
    res.json(data);
  } catch (err) {
    console.error('[proveedores]', err);
    res.status(500).json({ error: 'Error al buscar proveedores' });
  }
}
