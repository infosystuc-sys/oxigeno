import 'dotenv/config';
import express from 'express';
import cors from 'cors';

import proveedoresRoutes    from './routes/proveedores.routes';
import articulosRoutes      from './routes/articulos.routes';
import recepcionRoutes      from './routes/recepcion.routes';
import talonarioRoutes      from './routes/talonario.routes';
import clientesRoutes       from './routes/clientes.routes';
import remitoClienteRoutes  from './routes/remito-cliente.routes';

const app  = express();
const PORT = process.env.PORT ?? 3001;

app.use(cors({ origin: process.env.FRONTEND_URL ?? 'http://localhost:5173' }));
app.use(express.json());

// ── Rutas ────────────────────────────────────────────────────────────────────
app.use('/api/proveedores',    proveedoresRoutes);
app.use('/api/articulos',     articulosRoutes);
app.use('/api/recepcion',     recepcionRoutes);
app.use('/api/talonario',     talonarioRoutes);
app.use('/api/clientes',      clientesRoutes);
app.use('/api/remito-cliente', remitoClienteRoutes);

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

// ── Inicio ───────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Backend corriendo en http://localhost:${PORT}`);
});

export default app;
