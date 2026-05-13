import type { Request, Response } from 'express';
import { buscarClientes } from '../repositories/clientes.repository';

export async function getClientes(req: Request, res: Response): Promise<void> {
  const search = String(req.query.search ?? '');
  try {
    const clientes = await buscarClientes(search);
    res.json(clientes);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error interno';
    res.status(500).json({ error: msg });
  }
}
