import { Router } from 'express';
import { getProveedores } from '../controllers/proveedores.controller';

const router = Router();

// GET /api/proveedores?search=texto
router.get('/', getProveedores);

export default router;
