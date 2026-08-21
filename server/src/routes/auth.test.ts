import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { clearTestMongo, startTestMongo, stopTestMongo } from '../test/mongo.js';
import { createUser } from '../services/auth.service.js';
import { UserModel } from '../models/User.js';
import { can, permissionsFor } from '../config/permissions.js';

const app = createApp();

const ADMIN = { name: 'Geovanny', email: 'admin@negocio.com', password: 'clave-segura-123' };

async function loginAsAdmin() {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: ADMIN.email, password: ADMIN.password });
  return {
    token: res.body.data.accessToken as string,
    cookie: res.headers['set-cookie'] as unknown as string[],
    body: res.body,
  };
}

describe('Autenticación', () => {
  beforeAll(async () => {
    await startTestMongo();
  }, 120_000);

  afterAll(async () => {
    await stopTestMongo();
  });

  beforeEach(async () => {
    await clearTestMongo();
    await createUser({ ...ADMIN, role: 'ADMIN' });
  });

  describe('POST /api/auth/login', () => {
    it('entrega token, usuario y permisos', async () => {
      const { body } = await loginAsAdmin();
      expect(body.data.accessToken).toBeTruthy();
      expect(body.data.user).toMatchObject({ email: ADMIN.email, role: 'ADMIN' });
      expect(body.data.user.permissions).toContain('sale:void');
    });

    it('guarda el refresh en una cookie httpOnly, nunca en el cuerpo', async () => {
      const { cookie, body } = await loginAsAdmin();
      expect(cookie.join()).toMatch(/HttpOnly/i);
      expect(JSON.stringify(body)).not.toMatch(/refreshToken/);
    });

    it('nunca devuelve el hash de la contraseña', async () => {
      const { body } = await loginAsAdmin();
      expect(JSON.stringify(body)).not.toMatch(/passwordHash|argon2/);
    });

    it('da el MISMO mensaje con contraseña mala y con correo inexistente', async () => {
      const malaClave = await request(app)
        .post('/api/auth/login')
        .send({ email: ADMIN.email, password: 'incorrecta' });
      const noExiste = await request(app)
        .post('/api/auth/login')
        .send({ email: 'nadie@negocio.com', password: 'incorrecta' });

      expect(malaClave.status).toBe(401);
      expect(noExiste.status).toBe(401);
      // Mensajes distintos permitirían averiguar qué correos existen.
      expect(malaClave.body.error.message).toBe(noExiste.body.error.message);
    });

    it('rechaza a un usuario desactivado', async () => {
      await UserModel.updateOne({ email: ADMIN.email }, { active: false });
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: ADMIN.email, password: ADMIN.password });
      expect(res.status).toBe(401);
      expect(res.body.error.message).toMatch(/desactivado/);
    });

    it('valida el formato del correo', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'no-es-correo', password: 'x' });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('GET /api/auth/me', () => {
    it('exige token', async () => {
      const res = await request(app).get('/api/auth/me');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
    });

    it('rechaza un token falsificado', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer token.falso.inventado');
      expect(res.status).toBe(401);
    });

    it('devuelve el perfil con el token válido', async () => {
      const { token } = await loginAsAdmin();
      const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ email: ADMIN.email, role: 'ADMIN' });
    });
  });

  describe('POST /api/auth/refresh — rotación', () => {
    it('entrega un token nuevo y rota la cookie', async () => {
      const { cookie } = await loginAsAdmin();
      const res = await request(app).post('/api/auth/refresh').set('Cookie', cookie);

      expect(res.status).toBe(200);
      expect(res.body.data.accessToken).toBeTruthy();
      expect(res.headers['set-cookie']).toBeTruthy();
    });

    it('detecta el REUSO de un refresh ya rotado y mata la sesión', async () => {
      const { cookie: original } = await loginAsAdmin();

      // Primer uso: válido, rota la familia.
      const primero = await request(app).post('/api/auth/refresh').set('Cookie', original);
      expect(primero.status).toBe(200);

      // Segundo uso del MISMO token: señal de robo.
      const reuso = await request(app).post('/api/auth/refresh').set('Cookie', original);
      expect(reuso.status).toBe(401);
      expect(reuso.body.error.message).toMatch(/seguridad/i);

      // Y el token que sí era válido también queda invalidado.
      const posterior = await request(app)
        .post('/api/auth/refresh')
        .set('Cookie', primero.headers['set-cookie'] as unknown as string[]);
      expect(posterior.status).toBe(401);
    });

    it('sin cookie responde 401', async () => {
      const res = await request(app).post('/api/auth/refresh');
      expect(res.status).toBe(401);
    });
  });

  describe('Cierre de sesión y cambio de contraseña', () => {
    it('logout invalida el refresh', async () => {
      const { token, cookie } = await loginAsAdmin();

      const salida = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${token}`);
      expect(salida.status).toBe(200);

      const despues = await request(app).post('/api/auth/refresh').set('Cookie', cookie);
      expect(despues.status).toBe(401);
    });

    it('cambia la contraseña y la anterior deja de servir', async () => {
      const { token } = await loginAsAdmin();

      const cambio = await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${token}`)
        .send({ currentPassword: ADMIN.password, newPassword: 'otra-clave-mas-larga' });
      expect(cambio.status).toBe(200);

      const vieja = await request(app)
        .post('/api/auth/login')
        .send({ email: ADMIN.email, password: ADMIN.password });
      expect(vieja.status).toBe(401);

      const nueva = await request(app)
        .post('/api/auth/login')
        .send({ email: ADMIN.email, password: 'otra-clave-mas-larga' });
      expect(nueva.status).toBe(200);
    });

    it('no cambia la contraseña si la actual es incorrecta', async () => {
      const { token } = await loginAsAdmin();
      const res = await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${token}`)
        .send({ currentPassword: 'equivocada', newPassword: 'otra-clave-mas-larga' });
      expect(res.status).toBe(401);
    });

    it('exige una contraseña nueva de al menos 8 caracteres', async () => {
      const { token } = await loginAsAdmin();
      const res = await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${token}`)
        .send({ currentPassword: ADMIN.password, newPassword: 'corta' });
      expect(res.status).toBe(400);
    });
  });
});

describe('Matriz de permisos (§42 / T-29)', () => {
  it('solo el ADMIN puede anular una venta', () => {
    expect(can('ADMIN', 'sale:void')).toBe(true);
    expect(can('VENDEDOR', 'sale:void')).toBe(false);
    expect(can('CAJERO', 'sale:void')).toBe(false);
    expect(can('CONSULTA', 'sale:void')).toBe(false);
  });

  it('el vendedor vende y cobra, pero no compra ni ajusta inventario', () => {
    expect(can('VENDEDOR', 'sale:create')).toBe(true);
    expect(can('VENDEDOR', 'payment:create')).toBe(true);
    expect(can('VENDEDOR', 'purchase:create')).toBe(false);
    expect(can('VENDEDOR', 'inventory:adjust')).toBe(false);
  });

  it('el rol de consulta no escribe nada', () => {
    const escrituras = permissionsFor('CONSULTA').filter(
      (p) => p.includes(':write') || p.includes(':create') || p.includes(':void'),
    );
    expect(escrituras).toEqual([]);
  });

  it('nadie salvo el ADMIN toca la configuración ni los usuarios', () => {
    for (const rol of ['VENDEDOR', 'CAJERO', 'CONSULTA'] as const) {
      expect(can(rol, 'settings:write')).toBe(false);
      expect(can(rol, 'user:manage')).toBe(false);
      expect(can(rol, 'audit:read')).toBe(false);
    }
  });
});
