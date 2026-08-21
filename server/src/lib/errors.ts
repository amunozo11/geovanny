/**
 * Jerarquía única de errores (ARCHITECTURE.md §5).
 *
 * `code` es estable y lo traduce el cliente a español.
 * `rule` apunta a la regla de BUSINESS_RULES.md que se está haciendo cumplir,
 * para poder rastrear cualquier rechazo hasta su justificación de negocio.
 */
export abstract class AppError extends Error {
  abstract readonly status: number;
  abstract readonly code: string;
  readonly rule?: string;
  readonly details?: unknown;

  constructor(message: string, options: { rule?: string; details?: unknown } = {}) {
    super(message);
    this.name = new.target.name;
    this.rule = options.rule;
    this.details = options.details;
    Error.captureStackTrace?.(this, new.target);
  }

  toJSON() {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.rule ? { rule: this.rule } : {}),
        ...(this.details ? { details: this.details } : {}),
      },
    };
  }
}

export class ValidationError extends AppError {
  readonly status = 400;
  readonly code = 'VALIDATION_ERROR';
}

export class AuthError extends AppError {
  readonly status = 401;
  readonly code = 'UNAUTHENTICATED';
}

export class ForbiddenError extends AppError {
  readonly status = 403;
  readonly code = 'FORBIDDEN';
}

export class NotFoundError extends AppError {
  readonly status = 404;
  readonly code = 'NOT_FOUND';
}

export class ConflictError extends AppError {
  readonly status = 409;
  override readonly code: string;

  constructor(code: string, message: string, options: { rule?: string; details?: unknown } = {}) {
    super(message, options);
    this.code = code;
  }
}

/** 422: la petición es válida pero una regla de negocio la impide. */
export class BusinessRuleError extends AppError {
  readonly status = 422;
  override readonly code: string;

  constructor(code: string, message: string, options: { rule?: string; details?: unknown } = {}) {
    super(message, options);
    this.code = code;
  }
}

/** 502: falló un proveedor externo (p. ej. la API de tasas). */
export class IntegrationError extends AppError {
  readonly status = 502;
  readonly code = 'INTEGRATION_ERROR';
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
