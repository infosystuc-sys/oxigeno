import { Router } from 'express';
import {
  getRecepciones,
  getRemitos,
  getMovimientos,
  getDetalle,
  getSerie,
} from '../controllers/informes.controller';

const router = Router();

// GET /api/informes/recepciones?fecha_desde=&fecha_hasta=&cod_proveedor=&cod_articulo=
router.get('/recepciones', getRecepciones);

// GET /api/informes/remitos?fecha_desde=&fecha_hasta=&cod_cliente=&cod_articulo=
router.get('/remitos', getRemitos);

// GET /api/informes/movimientos?fecha_desde=&fecha_hasta=&cod_deposito=&cod_articulo=
router.get('/movimientos', getMovimientos);

// GET /api/informes/detalle/:id
router.get('/detalle/:id', getDetalle);

// GET /api/informes/serie/:serie
router.get('/serie/:serie', getSerie);

export default router;
