import { Router } from 'express';
import { postRemitoCliente } from '../controllers/remito-cliente.controller';

const router = Router();

// POST /api/remito-cliente
router.post('/', postRemitoCliente);

export default router;
