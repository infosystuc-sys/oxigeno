import { Router } from 'express';
import { postRecepcion } from '../controllers/recepcion.controller';

const router = Router();

// POST /api/recepcion
router.post('/', postRecepcion);

export default router;
