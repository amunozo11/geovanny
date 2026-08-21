import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import type { AppError } from '../lib/errors.js';
import { NotFoundError, isAppError } from '../lib/errors.js';
import { isProduction } from '../config/env.js';
import { logger } from '../lib/logger.js';

/** Ruta inexistente → 404 uniforme, no el HTML por defecto de Express. */
export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(new NotFoundError(`Ruta no encontrada: ${req.method} ${req.originalUrl}`));
}

/**
 * Manejador central de errores (§30, ARCHITECTURE.md §5).
 * Toda respuesta de error tiene la misma forma y nunca filtra el stack en producción.
 */
export function errorHandler(
  error: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (error instanceof ZodError) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Los datos enviados no son válidos.',
        details: error.issues.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message,
        })),
      },
    });
    return;
  }

  if (isAppError(error)) {
    const appError = error as AppError;
    // Los 4xx son parte de la operación normal; solo los 5xx son incidentes.
    const level = appError.status >= 500 ? 'error' : 'warn';
    logger[level](
      { requestId: req.requestId, code: appError.code, rule: appError.rule },
      appError.message,
    );
    res.status(appError.status).json(appError.toJSON());
    return;
  }

  logger.error({ requestId: req.requestId, err: error }, 'Error no controlado');

  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Ocurrió un error inesperado. La operación no se registró.',
      ...(isProduction ? {} : { details: error instanceof Error ? error.message : String(error) }),
    },
  });
}
