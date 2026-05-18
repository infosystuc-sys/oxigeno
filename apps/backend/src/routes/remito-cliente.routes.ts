import { Router } from 'express';
import {
  getProximoRemito,
  getValidarSerie,
  postRemitoCliente,
} from '../controllers/remito-cliente.controller';

const router = Router();

// GET /api/remito-cliente/proximo
router.get('/proximo', getProximoRemito);

// GET /api/remito-cliente/validar-serie?cod_articu=XXX&n_serie=YYY
router.get('/validar-serie', getValidarSerie);

// POST /api/remito-cliente
router.post('/', postRemitoCliente);

export default router;
