import 'dotenv/config';
import { z } from 'zod';

/**
 * Validación de entorno al arrancar (§43, §64).
 *
 * Si falta o está mal una variable, el proceso NO levanta. Es preferible fallar
 * al iniciar que fallar a mitad de una venta.
 */
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  API_PREFIX: z.string().startsWith('/').default('/api'),
  /**
   * Zona horaria del negocio. Los datos se guardan en UTC, pero "el día" es el
   * día aquí: una venta de las 8 p. m. pertenece a hoy, no a mañana.
   */
  TZ_NEGOCIO: z.string().default('America/Bogota'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL es obligatoria'),
  DATABASE_NAME: z.string().default('geovanny'),

  JWT_SECRET: z.string().min(32, 'JWT_SECRET debe tener al menos 32 caracteres'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET debe tener al menos 32 caracteres'),
  JWT_REFRESH_TTL: z.string().default('30d'),
  COOKIE_SECURE: z.coerce.boolean().default(false),
  /**
   * Acceso abierto: la aplicación no pide usuario ni contraseña y todo el que
   * llegue a la dirección entra como administrador.
   *
   * Es una decisión del negocio (20/08/2026). Exige ponerlo a mano y a
   * propósito: si esta variable no está, la puerta queda cerrada.
   */
  ACCESO_ABIERTO: z.coerce.boolean().default(false),

  CORS_ALLOWED_ORIGINS: z.string().default('http://localhost:5173'),

  RATES_ENABLED: z.coerce.boolean().default(false),
  RATES_REFRESH_MINUTES: z.coerce.number().int().positive().default(60),
  RATES_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
  RATES_ERAPI_URL: z.string().url().default('https://open.er-api.com/v6/latest/USD'),
  RATES_DOLARAPI_URL: z.string().url().default('https://ve.dolarapi.com/v1/dolares'),
  RATES_VES_DEFAULT_MARKET: z.enum(['OFICIAL', 'PARALELO']).default('PARALELO'),

  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(120),
  RATE_LIMIT_LOGIN_MAX: z.coerce.number().int().positive().default(5),
  BODY_LIMIT: z.string().default('1mb'),

  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  // Siembra del primer administrador (solo primer arranque; ver ENVIRONMENT.md)
  SEED_ADMIN_EMAIL: z.string().email().optional(),
  SEED_ADMIN_PASSWORD: z.string().min(8).optional(),
  SEED_ADMIN_NAME: z.string().optional(),
  SEED_BUSINESS_NAME: z.string().optional(),
});

/**
 * Las variables vacías se tratan como "no puesta".
 *
 * En los paneles de Vercel y Render es fácil dejar una casilla en blanco. Sin
 * esto, un `PORT=""` se convierte en 0, no pasa la validación y la aplicación
 * no arranca — con un error que no dice nada de dónde estaba el problema.
 */
const sinVacias = Object.fromEntries(
  Object.entries(process.env).filter(([, valor]) => valor !== undefined && valor !== ''),
);

const parsed = schema.safeParse(sinVacias);

if (!parsed.success) {
  const detail = parsed.error.issues
    .map((issue) => `  · ${issue.path.join('.')}: ${issue.message}`)
    .join('\n');

  console.error(
    `\n✖ Configuración de entorno inválida:\n${detail}\n\n` +
      '  Copia server/.env.example a server/.env y complétalo.\n',
  );
  process.exit(1);
}

export const env = parsed.data;

export const isProduction = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';

export const corsOrigins = env.CORS_ALLOWED_ORIGINS.split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
