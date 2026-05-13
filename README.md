# Oxigeno — Trazabilidad de Cilindros

Sistema web para la gestión y trazabilidad de cilindros de gases, integrado con el ERP **Tango Gestión** vía SQL Server.

## Estructura

```
oxigeno-trazabilidad/
├── packages/shared-types/   # Interfaces TypeScript compartidas
├── apps/backend/            # Node.js + Express + mssql
└── apps/frontend/           # React + Vite + Tailwind CSS
```

## Requisitos

- Node.js >= 18
- npm >= 8
- SQL Server con la base de datos de Tango Gestión accesible en red local

## Primeros pasos

### 1. Instalar dependencias

```bash
npm install
```

### 2. Configurar variables de entorno

```bash
cp .env.example apps/backend/.env
# Editar apps/backend/.env con los datos reales de conexión a SQL Server
```

### 3. Levantar en desarrollo

```bash
# Backend (puerto 3001)
npm run dev:backend

# Frontend (puerto 5173)
npm run dev:frontend
```

El frontend proxea `/api/*` automáticamente al backend.

## Variables de entorno (backend)

| Variable             | Descripción                              | Default              |
|----------------------|------------------------------------------|----------------------|
| `PORT`               | Puerto del servidor Express              | `3001`               |
| `FRONTEND_URL`       | Origen permitido por CORS                | `http://localhost:5173` |
| `DB_SERVER`          | IP o nombre del servidor SQL Server      | `localhost`          |
| `DB_PORT`            | Puerto SQL Server                        | `1433`               |
| `DB_NAME`            | Nombre de la base de datos Tango         | `GESTION`            |
| `DB_USER`            | Usuario SQL Server                       | —                    |
| `DB_PASSWORD`        | Contraseña SQL Server                    | —                    |
| `TANGO_TCOMP_INGRESO`| Tipo de comprobante de ingreso de stock  | `RE`                 |
