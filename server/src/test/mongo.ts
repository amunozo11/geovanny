import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';

/**
 * MongoDB real, en memoria y **en replica set**, para las pruebas.
 *
 * El replica set no es un lujo: sin él no hay transacciones multi-documento, y
 * casi todo lo que importa en este sistema (una venta toca 6 colecciones a la
 * vez) depende de ellas. Ver DATABASE.md §20.
 *
 * Ventaja adicional: no necesita Docker, así que las pruebas corren igual en
 * cualquier máquina y en CI.
 */
let replSet: MongoMemoryReplSet | null = null;

export async function startTestMongo(): Promise<string> {
  replSet = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger' },
  });
  const uri = replSet.getUri();
  await mongoose.connect(uri, { dbName: 'geovanny_test' });
  return uri;
}

export async function stopTestMongo(): Promise<void> {
  await mongoose.disconnect();
  await replSet?.stop();
  replSet = null;
}

/** Deja la base limpia entre pruebas sin recrear el servidor (es lo caro). */
export async function clearTestMongo(): Promise<void> {
  const { collections } = mongoose.connection;
  await Promise.all(Object.values(collections).map((collection) => collection.deleteMany({})));
}
