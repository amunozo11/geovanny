import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { logger } from './logger.js';

/**
 * Conexión a MongoDB.
 *
 * IMPORTANTE: la URL debe apuntar a un REPLICA SET. Las transacciones
 * multi-documento (venta = venta + movimientos + stock + cartera) no funcionan
 * contra un `mongod` suelto. Ver DEPLOYMENT.md §1.
 */
export async function connectDatabase(): Promise<typeof mongoose> {
  // Si ya hay conexión, se reutiliza. En un servidor normal esto no pasa nunca;
  // en serverless la instancia se reaprovecha entre peticiones y volver a
  // conectar agotaría el límite de conexiones de la base.
  if (mongoose.connection.readyState === 1) return mongoose;

  mongoose.set('strictQuery', true);
  // Nunca devolver un objeto Decimal128 crudo a la capa de dominio.
  mongoose.set('toJSON', { virtuals: true });

  const connection = await mongoose.connect(env.DATABASE_URL, {
    dbName: env.DATABASE_NAME,
    serverSelectionTimeoutMS: 8000,
    retryWrites: true,
  });

  logger.info({ db: env.DATABASE_NAME, host: connection.connection.host }, 'MongoDB conectado');

  await assertReplicaSet();
  return connection;
}

/**
 * Verifica que la instancia sea un replica set y avisa fuerte si no lo es.
 * Sin esto, el fallo aparecería mucho más tarde, en la primera venta.
 */
async function assertReplicaSet(): Promise<void> {
  try {
    const admin = mongoose.connection.db?.admin();
    const info = (await admin?.command({ hello: 1 })) as { setName?: string } | undefined;
    if (!info?.setName) {
      logger.warn(
        'MongoDB NO está en replica set: las transacciones fallarán. ' +
          'Ejecuta `npm run db:init` (ver DEPLOYMENT.md §5).',
      );
    } else {
      logger.info({ replicaSet: info.setName }, 'Replica set activo: transacciones disponibles');
    }
  } catch (error) {
    logger.warn({ err: error }, 'No se pudo verificar el replica set');
  }
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
  logger.info('MongoDB desconectado');
}

export function databaseState(): 'conectado' | 'conectando' | 'desconectado' | 'desconectando' {
  const map = {
    0: 'desconectado',
    1: 'conectado',
    2: 'conectando',
    3: 'desconectando',
  } as const;
  return map[mongoose.connection.readyState as 0 | 1 | 2 | 3] ?? 'desconectado';
}
