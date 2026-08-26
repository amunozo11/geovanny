import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    // Un solo mongod para toda la corrida, no uno por fichero.
    globalSetup: ['./src/test/globalSetup.ts'],
    /**
     * Cuatro ficheros a la vez.
     *
     * Ya no arrancan un `mongod` cada uno —lo comparten todos, ver
     * `globalSetup`—, así que la máquina aguanta más paralelismo del que hacía
     * falta cuando cada fichero traía su propio servidor a cuestas.
     */
    poolOptions: { threads: { maxThreads: 4 } },
    /**
     * 30 segundos por prueba, no los 5 de fábrica.
     *
     * Estas no son pruebas unitarias: cada una habla con un MongoDB de verdad y
     * abre transacciones multidocumento. Con los 5 s de fábrica, alguna se
     * pasaba de plazo de vez en cuando — y al agotarse, la prueba NO se detiene:
     * sigue escribiendo por detrás mientras la siguiente ya limpió la base, y
     * esa se cae con un choque de clave duplicada que no tiene nada que ver con
     * lo que estaba probando.
     */
    testTimeout: 30_000,
    hookTimeout: 120_000,
    // Entorno de prueba autocontenido: los tests no deben depender de un .env
    // local ni de una base de datos levantada.
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: 'mongodb://localhost:27017/geovanny_test?replicaSet=rs0',
      JWT_SECRET: 'secreto-de-prueba-suficientemente-largo-1234567890',
      JWT_REFRESH_SECRET: 'otro-secreto-de-prueba-suficientemente-largo-12345',
      LOG_LEVEL: 'error',
      // Límites altos en pruebas: el rate limit se verifica en su propio test,
      // no debe hacer fallar a los demás de forma intermitente.
      RATE_LIMIT_MAX: '10000',
      RATE_LIMIT_LOGIN_MAX: '1000',
    },
  },
});
