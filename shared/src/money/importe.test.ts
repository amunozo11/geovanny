import { describe, expect, it } from 'vitest';
import { crearImporte, enMoneda, sumarEn, type TasaDelDia } from './importe.js';

const tasa: TasaDelDia = {
  usdCop: '3099.309008',
  usdVes: '906.814802',
  mercado: 'PARALELO',
  fuente: 'MANUAL',
  at: '2026-08-20T00:00:00.000Z',
};

describe('Importe — un valor, tres monedas', () => {
  it('congela los tres equivalentes al crearse', () => {
    const venta = crearImporte('100', 'USD', tasa);
    expect(venta.eq).toEqual({ COP: '309931', USD: '100', VES: '90681.48' });
  });

  it('se lee en la moneda que el usuario elija', () => {
    const venta = crearImporte('700000', 'VES', tasa);
    expect(enMoneda(venta, 'VES').amount).toBe('700000');
    expect(enMoneda(venta, 'USD').amount).toBe('771.93');
    expect(enMoneda(venta, 'COP').amount).toBe('2392458');
  });

  it('suma ventas de distintas monedas en la moneda elegida (§20)', () => {
    const ventas = [
      crearImporte('100', 'USD', tasa),
      crearImporte('90681.48', 'VES', tasa),
      crearImporte('309931', 'COP', tasa),
    ];
    // Las tres valen lo mismo: el total debe ser 300 USD.
    expect(sumarEn(ventas, 'USD').amount).toBe('300');
  });

  it('no se recalcula si mañana cambia la tasa (RC-03)', () => {
    const venta = crearImporte('100', 'USD', tasa);
    const devaluado: TasaDelDia = { ...tasa, usdVes: '979.36' };
    const hoy = crearImporte('100', 'USD', devaluado);

    expect(venta.eq.VES).toBe('90681.48');
    expect(hoy.eq.VES).toBe('97936');
  });
});

describe('Plural de unidades', () => {
  it('acompaña bien la cantidad', async () => {
    const { conUnidad, plural } = await import('../texto.js');
    expect(conUnidad('80', 'BULTO')).toBe('80 bultos');
    expect(conUnidad('1', 'BULTO')).toBe('1 bulto');
    expect(conUnidad('0', 'CAJA')).toBe('0 cajas');
    expect(conUnidad('3', 'UNIDAD')).toBe('3 unidades');
    expect(plural('SACO', '-2')).toBe('sacos');
  });
});
