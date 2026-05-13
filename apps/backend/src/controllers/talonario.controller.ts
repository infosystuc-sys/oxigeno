import { Request, Response } from 'express';
import { obtenerProximoRecepcion } from '../repositories/talonario.repository';

export async function getTalonarioRecepcion(_req: Request, res: Response): Promise<void> {
  try {
    const data = await obtenerProximoRecepcion();
    res.json(data);
  } catch (err) {
    console.error('[talonario]', err);
    res.status(500).json({ error: 'Error al leer el talonario de recepción' });
  }
}
