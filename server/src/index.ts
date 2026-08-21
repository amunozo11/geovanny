import { createApp } from './app.js';
import { env } from './config/env.js';
import { connectDatabase, disconnectDatabase } from './lib/db.js';
import { sembrar } from './seed/index.js';
import { logger } from './lib/logger.js';

/**
 * Intenta conectar a Mongo sin bloquear el arranque, y reintenta en segundo plano.
 *
 * Por qué: si el proceso muriera al no encontrar la base, el proveedor de
 * despliegue entraría en un bucle de reinicios y `/api/health` nunca podría
 * informar del problema. Es preferible levantar en estado "degradado": el
 * healthcheck devuelve 503 y las operaciones que necesitan base fallan de forma
 * explícita, nunca en silencio.
 */
function connectWithRetry(attempt = 1): void {
  connectDatabase()
    .then(async () => {
      // Catálogos, productos, cajas y tasa inicial. Es idempotente, así que
      // desplegar por primera vez no exige entrar a ejecutar nada a mano.
      try {
        await sembrar();
      } catch (error) {
        logger.error({ err: error }, 'No se pudo preparar la base al arrancar');
      }
    })
    .catch((error) => {
      const delayMs = Math.min(30_000, 2_000 * attempt);
      logger.error(
        { err: error, attempt, retryInMs: delayMs },
        'Sin conexión a MongoDB: la API arranca en estado degradado',
      );
      setTimeout(() => connectWithRetry(attempt + 1), delayMs).unref();
    });
}

async function bootstrap(): Promise<void> {
  connectWithRetry();

  const app = createApp();
  const server = app.listen(env.PORT, () => {
    logger.info(
      { port: env.PORT, env: env.NODE_ENV },
      `API escuchando en http://localhost:${env.PORT}${env.API_PREFIX}`,
    );
  });

  // Apagado ordenado: se dejan terminar las peticiones en curso antes de cerrar.
  // Importa: una venta a medio guardar no puede quedar cortada por un despliegue.
  const shutdown = (signal: string) => {
    logger.info({ signal }, 'Cerrando servidor…');
    server.close(async () => {
      await disconnectDatabase();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

bootstrap().catch((error) => {
  logger.fatal({ err: error }, 'No se pudo iniciar el servidor');
  process.exit(1);
});
