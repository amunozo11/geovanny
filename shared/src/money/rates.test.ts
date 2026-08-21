import { describe, expect, it } from 'vitest';
import { money } from './money.js';
import {
  RateUnavailableError,
  buildEquivalents,
  captureSnapshot,
  convert,
  resolveRate,
  type RateQuote,
} from './rates.js';
import { formatRate } from './format.js';

/**
 * Todas las tasas de este archivo son REALES:
 * - 775,3356 y 906,8148 VES/USD → ve.dolarapi.com, 19/08/2026
 * - 3099,309008 COP/USD        → open.er-api.com, 19/08/2026
 * - 939,84 VES/USD y 3175,23 COP/USD → celdas P80 y P38 de su propio archivo
 */
const oficial: RateQuote = {
  base: 'USD',
  quote: 'VES',
  rate: '775.3356',
  market: 'OFICIAL',
  source: 'API',
  provider: 'dolarapi',
  effectiveAt: '2026-08-19T19:01:40.940Z',
};

const paralelo: RateQuote = {
  base: 'USD',
  quote: 'VES',
  rate: '906.814802',
  market: 'PARALELO',
  source: 'API',
  provider: 'dolarapi',
  effectiveAt: '2026-08-19T19:01:40.940Z',
};

const usdCop: RateQuote = {
  base: 'USD',
  quote: 'COP',
  rate: '3099.309008',
  market: 'OFICIAL',
  source: 'API',
  provider: 'erapi',
  effectiveAt: '2026-08-20T00:02:31.000Z',
};

const preferPara = { preferredMarkets: { VES: 'PARALELO' as const } };

describe('resolveRate — dirección y triangulación', () => {
  it('la misma moneda no necesita tasa', () => {
    const r = resolveRate('COP', 'COP', []);
    expect(r.factor).toBe('1');
    expect(r.derived).toBe(false);
  });

  it('usa la tasa directa tal como está almacenada', () => {
    const r = resolveRate('USD', 'VES', [paralelo], preferPara);
    expect(r.factor).toBe('906.814802');
    expect(r.path).toEqual(['USD', 'VES']);
    expect(r.derived).toBe(false);
  });

  it('para la dirección contraria divide, no usa una inversa pre-redondeada', () => {
    const r = resolveRate('VES', 'USD', [paralelo], preferPara);
    expect(r.components[0]?.inverted).toBe(true);
    // 1 / 906,814802 con 28 dígitos, no un 0,0011 redondeado
    expect(r.factor.startsWith('0.00110276')).toBe(true);
  });

  it('trianguló VES → COP por USD, igual que él a mano (CN-25)', () => {
    const r = resolveRate('VES', 'COP', [paralelo, usdCop], preferPara);
    expect(r.path).toEqual(['VES', 'USD', 'COP']);
    expect(r.derived).toBe(true);
    expect(r.components).toHaveLength(2);
  });

  it('NUNCA asume 1:1 cuando falta la tasa (T-24)', () => {
    expect(() => resolveRate('VES', 'COP', [paralelo], preferPara)).toThrow(RateUnavailableError);
    expect(() => resolveRate('VES', 'COP', [], preferPara)).toThrow(/Registra una tasa manual/);
  });

  it('falla explícitamente si la tasa almacenada es 0', () => {
    const rota: RateQuote = { ...paralelo, rate: '0' };
    expect(() => resolveRate('USD', 'VES', [rota], preferPara)).toThrow(RateUnavailableError);
  });
});

describe('Mercado de la tasa — la decisión que vale un 17% (C-2 / RC-30b)', () => {
  it('con mercado PARALELO exigido, ignora la tasa oficial', () => {
    const r = resolveRate('USD', 'VES', [oficial, paralelo], preferPara);
    expect(r.factor).toBe('906.814802');
  });

  it('la diferencia entre oficial y paralelo es material, no cosmética', () => {
    const enParalelo = convert(money('100', 'USD'), 'VES', [oficial, paralelo], preferPara);
    const enOficial = convert(money('100', 'USD'), 'VES', [oficial, paralelo], {
      preferredMarkets: { VES: 'OFICIAL' },
    });

    expect(enParalelo.amount).toBe('90681.48');
    expect(enOficial.amount).toBe('77533.56');
    // ~17% de diferencia sobre la misma venta
    expect(Number(enParalelo.amount) / Number(enOficial.amount)).toBeGreaterThan(1.16);
  });

  it('una tasa ACORDADA se acepta aunque se exija otro mercado (RC-29)', () => {
    const acordada: RateQuote = {
      base: 'USD',
      quote: 'VES',
      rate: '900',
      market: 'ACORDADA',
      source: 'MANUAL',
      effectiveAt: '2026-08-19T20:00:00.000Z',
    };
    const r = resolveRate('USD', 'VES', [acordada], preferPara);
    expect(r.factor).toBe('900');
  });
});

describe('convert — contra los números reales de su archivo', () => {
  it('reproduce la cadena Bs → US$ → COP de la hoja CLIENTES', () => {
    // Sus propias tasas del 12/08: P80 = 939,84 Bs/US$ · P38 = 3.175,23 COP/US$
    const suyas: RateQuote[] = [
      { base: 'USD', quote: 'VES', rate: '939.84', market: 'PARALELO', source: 'MANUAL' },
      { base: 'USD', quote: 'COP', rate: '3175.23', market: 'OFICIAL', source: 'MANUAL' },
    ];
    const deuda = money('8217000', 'VES'); // total "A DEBER" en bolívares
    expect(convert(deuda, 'USD', suyas, preferPara).amount).toBe('8742.98'); // su celda P82
  });

  it('detecta el error E-2 de su hoja: 274 millones donde son 61', () => {
    const suyas: RateQuote[] = [
      { base: 'USD', quote: 'VES', rate: '939.84', market: 'PARALELO', source: 'MANUAL' },
      { base: 'USD', quote: 'COP', rate: '3175.23', market: 'OFICIAL', source: 'MANUAL' },
    ];
    // Celda CLIENTES!O78 = 18.157.000 Bs; su celda O82 calcula 274.233.499 COP
    const correcto = convert(money('18157000', 'VES'), 'COP', suyas, preferPara);
    expect(correcto.amount).toBe('61343049');
    expect(Number(correcto.amount)).toBeLessThan(274233499 / 4);
  });

  it('convierte a COP sin centavos y a VES con dos decimales', () => {
    expect(convert(money('12990', 'USD'), 'COP', [usdCop]).amount).toBe('40260024');
    expect(convert(money('100', 'USD'), 'VES', [paralelo], preferPara).amount).toBe('90681.48');
  });

  it('ida y vuelta vuelve al punto de partida (INV-8)', () => {
    const original = money('100', 'USD');
    const enVes = convert(original, 'VES', [paralelo], preferPara);
    const vuelta = convert(enVes, 'USD', [paralelo], preferPara);
    expect(vuelta.amount).toBe('100');
  });
});

describe('Snapshot — el histórico no se recalcula (RC-03 / INV-7 / T-17)', () => {
  const quotesDelDia: RateQuote[] = [paralelo, usdCop];

  it('congela los equivalentes en el momento de la operación', () => {
    const venta = money('100', 'USD');
    const snapshot = captureSnapshot(venta, {
      functionalCurrency: 'COP',
      targets: ['COP', 'USD', 'VES'],
      quotes: quotesDelDia,
      options: preferPara,
      capturedAt: new Date('2026-08-19T15:00:00Z'),
    });

    expect(snapshot.equivalents).toEqual({
      COP: '309931',
      USD: '100',
      VES: '90681.48',
    });
    expect(snapshot.functionalCurrency).toBe('COP');
    expect(snapshot.capturedAt).toBe('2026-08-19T15:00:00.000Z');
  });

  it('guarda qué tasas se usaron, con su mercado y proveedor (RC-04)', () => {
    const snapshot = captureSnapshot(money('100', 'USD'), {
      functionalCurrency: 'COP',
      targets: ['COP', 'VES'],
      quotes: quotesDelDia,
      options: preferPara,
    });

    expect(snapshot.rates).toHaveLength(2);
    expect(snapshot.rates.map((r) => r.market).sort()).toEqual(['OFICIAL', 'PARALELO']);
    expect(snapshot.rates.every((r) => r.provider)).toBe(true);
  });

  it('si mañana cambia la tasa, la venta de ayer NO cambia', () => {
    const venta = money('100', 'USD');
    const ayer = captureSnapshot(venta, {
      functionalCurrency: 'COP',
      targets: ['VES'],
      quotes: quotesDelDia,
      options: preferPara,
    });

    // El bolívar se devalúa un 8%
    const hoy: RateQuote[] = [
      { ...paralelo, rate: '979.36', effectiveAt: '2026-08-20T12:00:00.000Z' },
      usdCop,
    ];
    const nuevoValor = convert(venta, 'VES', hoy, preferPara);

    expect(ayer.equivalents.VES).toBe('90681.48'); // intacto
    expect(nuevoValor.amount).toBe('97936'); // el de hoy es otro, y va aparte
  });
});

describe('buildEquivalents y formato', () => {
  it('calcula los tres equivalentes de un golpe (§20)', () => {
    const eq = buildEquivalents(
      money('1000000', 'COP'),
      ['COP', 'USD', 'VES'],
      [paralelo, usdCop],
      {
        preferredMarkets: { VES: 'PARALELO' },
      },
    );
    expect(eq.COP).toBe('1000000');
    expect(eq.USD).toBe('322.65');
    expect(eq.VES).toBe('292586.12');
  });

  it('la tasa se escribe siempre con su dirección, para no invertirla (C-1)', () => {
    expect(formatRate('USD', 'VES', '906.814802')).toBe('1 USD = 906,814802 VES');
    expect(formatRate('USD', 'COP', '3099.309008')).toBe('1 USD = 3.099,309008 COP');
  });
});
