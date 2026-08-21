import pino from 'pino';
import { env, isProduction } from '../config/env.js';

/**
 * Logs estructurados en JSON. En desarrollo se ven legibles con pino-pretty.
 *
 * `redact` evita que un token o una contraseña acabe en un archivo de log.
 */
export const logger = pino({
  level: env.LOG_LEVEL,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'password',
      '*.password',
      '*.passwordHash',
      'token',
      '*.token',
    ],
    censor: '[oculto]',
  },
  ...(isProduction
    ? {}
    : {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
        },
      }),
});
