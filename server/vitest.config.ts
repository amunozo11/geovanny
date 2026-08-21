import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
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
