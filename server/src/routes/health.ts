import { Router } from 'express';
import { databaseState } from '../lib/db.js';
import { env } from '../config/env.js';

export const healthRouter = Router();

/**
 * Healthcheck para el proveedor de despliegue y el monitoreo (DEPLOYMENT.md §7).
 * Incluye el estado de la base de datos: una API viva con la base caída no está sana.
 */
healthRouter.get('/health', (_req, res) => {
  const database = databaseState();
  const healthy = database === 'conectado';

  res.status(healthy ? 200 : 503).json({
    data: {
      status: healthy ? 'ok' : 'degradado',
      version: '0.1.0',
      environment: env.NODE_ENV,
      database,
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    },
  });
});
