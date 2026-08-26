import { MongoMemoryReplSet } from 'mongodb-memory-server';
import type { TestProject } from 'vitest/node';

/**
 * Un solo MongoDB para toda la corrida de pruebas.
 *
 * Antes cada fichero —y dentro de un fichero, cada bloque `describe`— levantaba
 * el suyo. Con nueve ficheros eso eran once `mongod` arrancando y parando en
 * una sola corrida, y la máquina no daba: aparecían fallos que no tenían nada
 * que ver con el código —una prueba que se pasa de tiempo, un arranque que no
 * termina— más o menos una de cada tres veces. Un rojo que no significa nada
 * enseña a ignorar los rojos, y eso vale menos que no tener pruebas.
 *
 * Sigue siendo un replica set porque sin él no hay transacciones
 * multi-documento, y casi todo lo que importa aquí depende de ellas
 * (DATABASE.md §20). Y sigue sin necesitar Docker.
 */
export default async function setup({ provide }: TestProject) {
  const replSet = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger' },
  });

  provide('mongoUri', replSet.getUri());

  return async () => {
    await replSet.stop();
  };
}

declare module 'vitest' {
  interface ProvidedContext {
    mongoUri: string;
  }
}
