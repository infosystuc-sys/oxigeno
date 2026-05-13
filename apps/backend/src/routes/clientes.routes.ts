import { Router } from 'express';
import { getClientes } from '../controllers/clientes.controller';

const router = Router();

// GET /api/clientes?search=...
router.get('/', getClientes);

export default router;
