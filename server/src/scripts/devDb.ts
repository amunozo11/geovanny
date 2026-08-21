import { MongoMemoryReplSet } from 'mongodb-memory-server';
import path from 'node:path';
import fs from 'node:fs';

/**
 * Base de datos de DESARROLLO sin Docker.
 *
 * Levanta un `mongod` real en replica set (necesario para las transacciones)
 * escuchando en el puerto 27017, con los datos en `.mongo-data/` para que
 * sobrevivan al reinicio.
 *
 * Es la alternativa a `npm run db:up` cuando Docker no está disponible.
 * En producción se usa MongoDB Atlas (DEPLOYMENT.md §4).
 */
const PUERTO = 27017;
const RUTA_DATOS = path.resolve(process.cwd(), '.mongo-data');

async function main(): Promise<void> {
  fs.mkdirSync(RUTA_DATOS, { recursive: true });

  const replSet = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger', name: 'rs0' },
    instanceOpts: [{ port: PUERTO, storageEngine: 'wiredTiger', dbPath: RUTA_DATOS }],
  });

  const uri = `mongodb://localhost:${PUERTO}/geovanny?replicaSet=rs0&directConnection=true`;
  console.warn(`\n  MongoDB de desarrollo listo (replica set, transacciones activas)`);
  console.warn(`  URI:   ${uri}`);
  console.warn(`  Datos: ${RUTA_DATOS}`);
  console.warn(`\n  Déjalo abierto mientras trabajas. Ctrl+C para detenerlo.\n`);

  const detener = async () => {
    await replSet.stop();
    process.exit(0);
  };
  process.on('SIGINT', () => void detener());
  process.on('SIGTERM', () => void detener());
}

main().catch((error) => {
  console.error('No se pudo iniciar la base de desarrollo:', error);
  process.exit(1);
});
