import { Router } from 'express';
import {
  getProximoRemito,
  postRemitoCliente,
} from '../controllers/remito-cliente.controller';

const router = Router();

// GET /api/remito-cliente/proximo
router.get('/proximo', getProximoRemito);

// POST /api/remito-cliente
router.post('/', postRemitoCliente);

export default router;
