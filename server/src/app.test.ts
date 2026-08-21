import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from './app.js';

const app = createApp();

describe('Salud de la API', () => {
  it('responde el healthcheck aunque la base no esté conectada', async () => {
    const res = await request(app).get('/api/health');
    // 503 sin base de datos, 200 con ella: en ambos casos responde con forma válida.
    expect([200, 503]).toContain(res.status);
    expect(res.body.data).toMatchObject({ version: '0.1.0' });
  });

  it('devuelve un X-Request-Id en cada respuesta', async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers['x-request-id']).toBeTruthy();
  });

  it('respeta el X-Request-Id que envía el cliente', async () => {
    const res = await request(app).get('/api/health').set('X-Request-Id', 'abc-123');
    expect(res.headers['x-request-id']).toBe('abc-123');
  });

  it('una ruta inexistente devuelve un 404 con la forma estándar', async () => {
    const res = await request(app).get('/api/no-existe');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});

describe('GET /api/currencies', () => {
  it('lista las monedas con sus decimales', async () => {
    const res = await request(app).get('/api/currencies');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(3);
    expect(res.body.data.find((c: { code: string }) => c.code === 'COP')).toMatchObject({
      decimals: 0,
    });
  });
});

describe('POST /api/currencies/preview-conversion', () => {
  const quotes = [
    {
      base: 'USD',
      quote: 'VES',
      rate: '906.814802',
      market: 'PARALELO',
      source: 'API',
      provider: 'dolarapi',
    },
    {
      base: 'USD',
      quote: 'COP',
      rate: '3099.309008',
      market: 'OFICIAL',
      source: 'API',
      provider: 'erapi',
    },
  ];

  it('convierte y explica con qué tasa lo hizo (§20)', async () => {
    const res = await request(app)
      .post('/api/currencies/preview-conversion')
      .send({ amount: '100', from: 'USD', to: 'VES', quotes });

    expect(res.status).toBe(200);
    expect(res.body.data.converted).toEqual({ amount: '90681.48', currency: 'VES' });
    expect(res.body.data.rate.components[0]).toMatchObject({
      market: 'PARALELO',
      provider: 'dolarapi',
      inverted: false,
    });
  });

  it('triangula por USD y lo marca como derivado (CN-25)', async () => {
    const res = await request(app)
      .post('/api/currencies/preview-conversion')
      .send({ amount: '90681.48', from: 'VES', to: 'COP', quotes });

    expect(res.status).toBe(200);
    expect(res.body.data.rate.path).toEqual(['VES', 'USD', 'COP']);
    expect(res.body.data.rate.derived).toBe(true);
  });

  it('rechaza un importe numérico: el dinero viaja como string (§32)', async () => {
    const res = await request(app)
      .post('/api/currencies/preview-conversion')
      .send({ amount: 100.5, from: 'USD', to: 'VES', quotes });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('devuelve 422 con la regla citada si no hay tasa (RC-05)', async () => {
    const res = await request(app)
      .post('/api/currencies/preview-conversion')
      .send({ amount: '100', from: 'VES', to: 'COP', quotes: [quotes[0]] });

    expect(res.status).toBe(422);
    expect(res.body.error).toMatchObject({ code: 'RATE_UNAVAILABLE', rule: 'RC-05' });
  });
});
