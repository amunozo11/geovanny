import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, api, getAccessToken, refreshSession, setAccessToken, setOnSessionLost } from './api';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('Cliente HTTP', () => {
  beforeEach(() => {
    setAccessToken(null);
    setOnSessionLost(null);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /**
   * Regresión de un fallo real encontrado el 19/08/2026:
   * dos renovaciones simultáneas hacían que la segunda llegara con la cookie ya
   * rotada, el servidor lo tomaba por robo de token (correctamente) y cerraba
   * la sesión al recargar la página.
   */
  it('agrupa las renovaciones concurrentes en UNA sola petición', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ data: { accessToken: 'nuevo' } }));
    vi.stubGlobal('fetch', fetchMock);

    const resultados = await Promise.all([refreshSession(), refreshSession(), refreshSession()]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(resultados).toEqual([true, true, true]);
    expect(getAccessToken()).toBe('nuevo');
  });

  it('permite renovar de nuevo más tarde', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ data: { accessToken: 'otro' } }));
    vi.stubGlobal('fetch', fetchMock);

    await refreshSession();
    await refreshSession();

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('ante un 401 renueva y repite la petición una vez', async () => {
    let llamada = 0;
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes('/auth/refresh')) {
        return jsonResponse({ data: { accessToken: 'renovado' } });
      }
      llamada += 1;
      return llamada === 1
        ? jsonResponse({ error: { code: 'UNAUTHENTICATED', message: 'expirado' } }, 401)
        : jsonResponse({ data: { ok: true } });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(api('/sales')).resolves.toEqual({ ok: true });
    expect(getAccessToken()).toBe('renovado');
  });

  it('avisa de sesión perdida si la renovación falla', async () => {
    const perdida = vi.fn();
    setOnSessionLost(perdida);
    vi.stubGlobal('fetch', async (url: string) =>
      String(url).includes('/auth/refresh')
        ? jsonResponse({ error: { code: 'UNAUTHENTICATED', message: 'no' } }, 401)
        : jsonResponse({ error: { code: 'UNAUTHENTICATED', message: 'expirado' } }, 401),
    );

    await expect(api('/sales')).rejects.toBeInstanceOf(ApiError);
    expect(perdida).toHaveBeenCalledOnce();
  });

  it('NO intenta renovar cuando el que falla es el propio login', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ error: { code: 'UNAUTHENTICATED', message: 'Correo o contraseña incorrectos.' } }, 401),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(api('/auth/login', { method: 'POST' })).rejects.toThrow(
      /Correo o contraseña incorrectos/,
    );
    // Una sola llamada: la del login. Renovar aquí sería un bucle.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('traduce el error de la API conservando código y regla', async () => {
    vi.stubGlobal('fetch', async () =>
      jsonResponse(
        { error: { code: 'RATE_UNAVAILABLE', message: 'No hay tasa', rule: 'RC-05' } },
        422,
      ),
    );

    await expect(api('/currencies/preview-conversion')).rejects.toMatchObject({
      status: 422,
      code: 'RATE_UNAVAILABLE',
      rule: 'RC-05',
    });
  });

  it('envía el token de acceso en la cabecera cuando existe', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
      jsonResponse({ data: {} }),
    );
    vi.stubGlobal('fetch', fetchMock);
    setAccessToken('abc123');

    await api('/auth/me');

    const headers = fetchMock.mock.calls[0]?.[1]?.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer abc123');
  });
});
