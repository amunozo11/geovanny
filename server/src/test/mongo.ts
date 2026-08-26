import mongoose from 'mongoose';
import { inject } from 'vitest';

/**
 * Conexión a la base de pruebas.
 *
 * El `mongod` lo levanta `globalSetup` una sola vez para toda la corrida; aquí
 * solo se abre la conexión. Cada worker usa su propia base dentro del mismo
 * servidor, así que dos ficheros en paralelo no se pisan los datos.
 *
 * `startTestMongo` es idempotente a propósito: un fichero con varios bloques
 * `describe` lo llama una vez por bloque, y reconectar en cada uno era tiempo
 * tirado —y una fuente de fallos cuando el `afterAll` de un bloque cerraba la
 * conexión que el siguiente acababa de abrir.
 */

/** Una base por worker: los ficheros en paralelo no comparten datos. */
const nombreBase = () => `geovanny_test_${process.env.VITEST_WORKER_ID ?? '0'}`;

export async function startTestMongo(): Promise<string> {
  const uri = inject('mongoUri');
  if (mongoose.connection.readyState === 1) return uri;

  await mongoose.connect(uri, { dbName: nombreBase() });
  return uri;
}

/**
 * No para el servidor —es de toda la corrida—, solo cierra la conexión.
 * Se deja la base limpia para el fichero que venga después en este worker.
 */
export async function stopTestMongo(): Promise<void> {
  if (mongoose.connection.readyState !== 1) return;
  await clearTestMongo();
  await mongoose.disconnect();
}

/** Deja la base limpia entre pruebas sin recrear el servidor (es lo caro). */
export async function clearTestMongo(): Promise<void> {
  const { collections } = mongoose.connection;
  await Promise.all(Object.values(collections).map((collection) => collection.deleteMany({})));
}
