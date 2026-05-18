import { Router } from 'express';
import {
  getDepositos,
  getProximoMovimiento,
  postMovimientoDeposito,
} from '../controllers/movimiento-depositos.controller';

const router = Router();

// GET /api/movimiento-depositos/depositos?search=...
router.get('/depositos', getDepositos);

// GET /api/movimiento-depositos/proximo
router.get('/proximo', getProximoMovimiento);

// POST /api/movimiento-depositos
router.post('/', postMovimientoDeposito);

export default router;
