import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    /**
     * Dos ficheros a la vez como mucho.
     *
     * Cada fichero de prueba levanta un `mongod` real en replica set —hace
     * falta para las transacciones— y arrancar ocho a la vez pone la máquina de
     * rodillas: los tests empiezan a fallar por tiempo de espera, no porque el
     * código esté mal. Un fallo intermitente que no significa nada es peor que
     * ninguna prueba, porque enseña a ignorar los rojos.
     */
    poolOptions: { threads: { maxThreads: 2 } },
    /**
     * 30 segundos por prueba, no los 5 de fábrica.
     *
     * Estas no son pruebas unitarias: cada una habla con un MongoDB de verdad y
     * abre transacciones multidocumento. Con dos ficheros a la vez, la primera
     * prueba de cada uno se pasaba de los 5 s de vez en cuando — y al agotarse
     * el plazo la prueba NO se detiene: sigue escribiendo por detrás mientras la
     * siguiente ya limpió la base, y esa se cae con un choque de clave duplicada
     * que no tiene nada que ver con lo que estaba probando. Un rojo que no
     * significa nada enseña a ignorar los rojos.
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
