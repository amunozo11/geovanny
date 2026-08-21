const BASE = import.meta.env.VITE_API_URL ?? '/api';

export interface ApiErrorBody {
  error: { code: string; message: string; rule?: string; details?: unknown };
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly rule?: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * El token de acceso vive SOLO en memoria, nunca en localStorage.
 *
 * Si se guardara en localStorage, cualquier script inyectado podría leerlo. La
 * sesión se recupera al recargar mediante la cookie httpOnly de refresco, que
 * el JavaScript de la página no puede leer.
 */
let accessToken: string | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

/** Llamado cuando la sesión se pierde de forma definitiva. */
let onSessionLost: (() => void) | null = null;
export function setOnSessionLost(handler: (() => void) | null): void {
  onSessionLost = handler;
}

async function rawRequest(path: string, init: RequestInit): Promise<Response> {
  return fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...(init.headers ?? {}),
    },
    credentials: 'include',
  });
}

/**
 * Renovación en curso, compartida por todas las llamadas concurrentes.
 *
 * IMPRESCINDIBLE: el refresco es de un solo uso y rota la familia de tokens. Si
 * dos peticiones lo pidieran a la vez, la segunda llegaría con la cookie ya
 * rotada y el servidor lo interpretaría —con razón— como robo de token,
 * cerrando la sesión. Se comparte una única promesa para que solo salga una
 * petición HTTP.
 */
let renovacionEnCurso: Promise<boolean> | null = null;

/** Renueva el token con la cookie httpOnly. Devuelve `true` si lo consiguió. */
export function refreshSession(): Promise<boolean> {
  renovacionEnCurso ??= (async () => {
    try {
      const response = await fetch(`${BASE}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!response.ok) {
        accessToken = null;
        return false;
      }
      const body = (await response.json()) as { data: { accessToken: string } };
      accessToken = body.data.accessToken;
      return true;
    } finally {
      // Se libera en el siguiente tick para que las llamadas que entren
      // durante esta misma renovación reutilicen el resultado.
      queueMicrotask(() => {
        renovacionEnCurso = null;
      });
    }
  })();

  return renovacionEnCurso;
}

/**
 * Cliente HTTP único. Ante un 401 intenta renovar la sesión UNA vez y repite la
 * petición; así el token corto (15 min) no interrumpe una venta a medio hacer.
 */
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const esRutaDeSesion = path.startsWith('/auth/login') || path.startsWith('/auth/refresh');

  let response = await rawRequest(path, init);

  if (response.status === 401 && !esRutaDeSesion) {
    if (await refreshSession()) {
      response = await rawRequest(path, init);
    } else {
      onSessionLost?.();
    }
  }

  const isJson = response.headers.get('content-type')?.includes('application/json');
  const body = isJson ? await response.json() : null;

  if (!response.ok) {
    const err = (body as ApiErrorBody | null)?.error;
    throw new ApiError(
      response.status,
      err?.code ?? 'NETWORK_ERROR',
      err?.message ?? 'No se pudo conectar con el servidor.',
      err?.rule,
      err?.details,
    );
  }

  return (body as { data: T }).data;
}
