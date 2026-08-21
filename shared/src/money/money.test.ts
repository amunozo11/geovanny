import { describe, expect, it } from 'vitest';
import { D, PrecisionError, unsafeDecimalFromNumber } from './decimal.js';
import {
  add,
  allocate,
  divide,
  equals,
  greaterThan,
  isNegative,
  money,
  multiply,
  round,
  subtract,
  sum,
  toDecimal,
  zero,
} from './money.js';
import { CurrencyMismatchError, defaultCurrencyRegistry } from './currency.js';

describe('Decimal — precisión (RC-02 / §32)', () => {
  it('no arrastra el error de coma flotante', () => {
    // En float: 0.1 + 0.2 === 0.30000000000000004
    expect(D('0.1').plus(D('0.2')).toString()).toBe('0.3');
  });

  it('rechaza un number fraccionario y explica qué hacer', () => {
    expect(() => D(0.1)).toThrow(PrecisionError);
    expect(() => D(1.5)).toThrow(/string para no perder precisión/);
  });

  it('acepta enteros seguros (cantidades, contadores)', () => {
    expect(D(20).toString()).toBe('20');
  });

  it('la escotilla explícita convierte sin sorpresas', () => {
    expect(unsafeDecimalFromNumber(906.814802, 'dolarapi').toString()).toBe('906.814802');
  });

  it('mantiene precisión con una tasa de muchos decimales', () => {
    // Caso real: 1 USD = 3099,309008 COP (open.er-api.com, 19/08/2026)
    expect(D('1250.55').times(D('3099.309008')).toString()).toBe('3875840.8799544');
  });
});

describe('Money — operaciones básicas', () => {
  it('suma y resta dentro de la misma moneda', () => {
    expect(add(money('900000', 'COP'), money('180000', 'COP')).amount).toBe('1080000');
    expect(subtract(money('5000000', 'COP'), money('1000000', 'COP')).amount).toBe('4000000');
  });

  it('se niega a mezclar monedas en silencio (RC-06)', () => {
    expect(() => add(money('100', 'USD'), money('90000', 'VES'))).toThrow(CurrencyMismatchError);
    expect(() => add(money('100', 'USD'), money('90000', 'VES'))).toThrow(
      /Convierte primero con una tasa explícita/,
    );
  });

  it('multiplica cantidad por precio, incluso con cantidades fraccionarias (CN-9)', () => {
    // Medio bulto de cebolla a 48.000 Bs — línea real de la hoja STOCK
    expect(multiply(money('48000', 'VES'), '0.5').amount).toBe('24000');
    expect(multiply(money('35000', 'VES'), '20').amount).toBe('700000');
  });

  it('suma una lista de subtotales (INV-4)', () => {
    const items = [money('900000', 'COP'), money('180000', 'COP'), money('225000', 'COP')];
    expect(sum(items, 'COP').amount).toBe('1305000');
  });

  it('divide y protege contra división por cero', () => {
    expect(divide(money('100', 'USD'), '4').amount).toBe('25');
    expect(() => divide(money('100', 'USD'), '0')).toThrow(RangeError);
  });

  it('admite saldo negativo, que en el negocio es "a favor" (CN-17)', () => {
    const aFavor = subtract(money('3665000', 'COP'), money('4000000', 'COP'));
    expect(isNegative(aFavor)).toBe(true);
    expect(aFavor.amount).toBe('-335000');
  });

  it('compara importes', () => {
    expect(greaterThan(money('100', 'USD'), money('99.99', 'USD'))).toBe(true);
    expect(equals(money('100.00', 'USD'), money('100', 'USD'))).toBe(true);
    expect(equals(money('100', 'USD'), money('100', 'VES'))).toBe(false);
  });
});

describe('Money — redondeo por moneda', () => {
  it('COP no lleva centavos, USD y VES sí', () => {
    expect(round(money('41246237.70', 'COP')).amount).toBe('41246238');
    expect(round(money('90681.4802', 'VES')).amount).toBe('90681.48');
    expect(round(money('348.4956', 'USD')).amount).toBe('348.5');
  });

  it('usa HALF_UP, el redondeo comercial esperado', () => {
    expect(round(money('0.5', 'COP')).amount).toBe('1');
    expect(round(money('1.5', 'COP')).amount).toBe('2');
    expect(round(money('2.345', 'USD')).amount).toBe('2.35');
  });

  it('no redondea antes de tiempo: el cálculo intermedio conserva todo', () => {
    const bruto = multiply(money('12990', 'USD'), '3175.23');
    expect(bruto.amount).toBe('41246237.7'); // sin redondear
    expect(round({ ...bruto, currency: 'COP' }).amount).toBe('41246238'); // solo al final
  });
});

describe('allocate — reparto sin perder ni un centavo (INV-4 / T-26 / T-27)', () => {
  it('reparte un peso indivisible entre tres y cuadra exacto', () => {
    const parts = allocate(money('100', 'COP'), ['1', '1', '1']);
    expect(parts.map((p) => p.amount)).toEqual(['34', '33', '33']);
    expect(sum(parts, 'COP').amount).toBe('100');
  });

  it('reparte el CARGUE de un viaje por valor y cuadra exacto (RP-03 / CN-15)', () => {
    // Caso del §12: 1.600.000 de costos adicionales sobre tres productos
    const extra = money('1600000', 'COP');
    const valores = ['68744000', '27560000', '22800000']; // viajes reales de HIJINIO
    const parts = allocate(extra, valores);

    expect(sum(parts, 'COP').amount).toBe('1600000');
    // El de mayor valor absorbe la mayor parte del cargue
    expect(toDecimal(parts[0]!).greaterThan(toDecimal(parts[1]!))).toBe(true);
  });

  it('cuadra exacto también con decimales (USD)', () => {
    const parts = allocate(money('10', 'USD'), ['1', '1', '1']);
    expect(sum(parts, 'USD').amount).toBe('10');
    expect(parts.map((p) => p.amount)).toEqual(['3.34', '3.33', '3.33']);
  });

  it('reparte equitativamente si todos los pesos son cero', () => {
    const parts = allocate(money('90', 'COP'), ['0', '0', '0']);
    expect(sum(parts, 'COP').amount).toBe('90');
  });

  it('cuadra exacto con importes negativos (devoluciones)', () => {
    const parts = allocate(money('-100', 'COP'), ['1', '1', '1']);
    expect(sum(parts, 'COP').amount).toBe('-100');
  });

  it('devuelve lista vacía si no hay partes', () => {
    expect(allocate(money('100', 'COP'), [])).toEqual([]);
  });

  it('cuadra exacto en 200 repartos aleatorios de tres partes', () => {
    for (let i = 1; i <= 200; i += 1) {
      const total = money(String(i * 7919), 'VES');
      const parts = allocate(total, [String(i), String(i + 3), String(i * 2 + 1)]);
      expect(sum(parts, 'VES').amount).toBe(round(total).amount);
    }
  });
});

describe('zero / registro de monedas', () => {
  it('el cero conserva su moneda', () => {
    expect(zero('VES')).toEqual({ amount: '0', currency: 'VES' });
  });

  it('el registro conoce los decimales de cada moneda', () => {
    expect(defaultCurrencyRegistry.decimalsFor('COP')).toBe(0);
    expect(defaultCurrencyRegistry.decimalsFor('ves')).toBe(2);
    expect(() => defaultCurrencyRegistry.get('XYZ')).toThrow(/Moneda desconocida/);
  });
});
