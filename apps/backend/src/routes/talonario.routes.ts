import { Router } from 'express';
import { getTalonarioRecepcion } from '../controllers/talonario.controller';

const router = Router();

// GET /api/talonario/recepcion
router.get('/recepcion', getTalonarioRecepcion);

export default router;
