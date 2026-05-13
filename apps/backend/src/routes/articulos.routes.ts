import { Router } from 'express';
import { getArticulosGases } from '../controllers/articulos.controller';

const router = Router();

// GET /api/articulos/gases
router.get('/gases', getArticulosGases);

export default router;
