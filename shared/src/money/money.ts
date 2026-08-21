import { D, Decimal, ZERO, type DecimalInput } from './decimal.js';
import type { CurrencyRegistry } from './currency.js';
import { CurrencyMismatchError, defaultCurrencyRegistry } from './currency.js';

/**
 * Un importe SIEMPRE lleva su moneda pegada. No existe "un número de dinero"
 * suelto en este sistema: eso es lo que produce los errores del archivo actual
 * (ver ANALISIS_CUADERNO.md E-1).
 *
 * `amount` viaja como STRING —en la API, en JSON y hacia Mongo— porque un
 * `number` de JavaScript no puede representar 906814.802000000001 sin perderlo.
 */
export interface Money {
  amount: string;
  currency: string;
}

export function money(amount: DecimalInput, currency: string): Money {
  return { amount: D(amount).toString(), currency: currency.toUpperCase() };
}

export function zero(currency: string): Money {
  return money('0', currency);
}

export function toDecimal(m: Money): Decimal {
  return D(m.amount);
}

function assertSameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) throw new CurrencyMismatchError(a.currency, b.currency);
}

// ─── Aritmética ──────────────────────────────────────────────────────────────

export function add(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return money(toDecimal(a).plus(toDecimal(b)), a.currency);
}

export function subtract(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return money(toDecimal(a).minus(toDecimal(b)), a.currency);
}

export function negate(m: Money): Money {
  return money(toDecimal(m).negated(), m.currency);
}

export function absolute(m: Money): Money {
  return money(toDecimal(m).abs(), m.currency);
}

/** Multiplica por un factor sin unidad (cantidad, porcentaje, tasa). */
export function multiply(m: Money, factor: DecimalInput): Money {
  return money(toDecimal(m).times(D(factor)), m.currency);
}

export function divide(m: Money, divisor: DecimalInput): Money {
  const d = D(divisor);
  if (d.isZero()) throw new RangeError('División de dinero por cero');
  return money(toDecimal(m).dividedBy(d), m.currency);
}

export function sum(items: readonly Money[], currency: string): Money {
  return items.reduce<Money>((acc, item) => add(acc, item), zero(currency));
}

// ─── Comparación ─────────────────────────────────────────────────────────────

export function compare(a: Money, b: Money): -1 | 0 | 1 {
  assertSameCurrency(a, b);
  return toDecimal(a).comparedTo(toDecimal(b)) as -1 | 0 | 1;
}

export function equals(a: Money, b: Money): boolean {
  return a.currency === b.currency && toDecimal(a).equals(toDecimal(b));
}

export const isZero = (m: Money): boolean => toDecimal(m).isZero();
export const isNegative = (m: Money): boolean => toDecimal(m).isNegative();
export const isPositive = (m: Money): boolean => toDecimal(m).greaterThan(ZERO);
export const greaterThan = (a: Money, b: Money): boolean => compare(a, b) > 0;
export const lessThan = (a: Money, b: Money): boolean => compare(a, b) < 0;

// ─── Redondeo ────────────────────────────────────────────────────────────────

/**
 * Redondea a los decimales de su moneda. Se aplica SOLO en los bordes:
 * al persistir y al mostrar. Nunca en cálculos intermedios (ver ANALISIS.md,
 * riesgo "redondeo asimétrico").
 */
export function round(m: Money, registry: CurrencyRegistry = defaultCurrencyRegistry): Money {
  const decimals = registry.decimalsFor(m.currency);
  return money(toDecimal(m).toDecimalPlaces(decimals, Decimal.ROUND_HALF_UP), m.currency);
}

/** La unidad mínima de la moneda: 1 para COP (0 decimales), 0.01 para USD. */
export function minorUnit(
  currency: string,
  registry: CurrencyRegistry = defaultCurrencyRegistry,
): Decimal {
  return D(1).dividedBy(D(10).toPower(registry.decimalsFor(currency)));
}

// ─── Reparto sin perder centavos ─────────────────────────────────────────────

/**
 * Reparte un importe entre N partes según pesos, garantizando que la suma de las
 * partes es EXACTAMENTE el importe original (invariante INV-4 / test T-26).
 *
 * Método del mayor resto: se redondea cada parte hacia abajo y el sobrante se
 * asigna, unidad mínima a unidad mínima, a las partes con mayor resto.
 *
 * Es la base del reparto del cargue entre los productos de un viaje (RP-03).
 */
export function allocate(
  total: Money,
  weights: readonly DecimalInput[],
  registry: CurrencyRegistry = defaultCurrencyRegistry,
): Money[] {
  if (weights.length === 0) return [];

  const decimals = registry.decimalsFor(total.currency);
  const unit = minorUnit(total.currency, registry);
  const totalDec = toDecimal(total);
  const weightDecs = weights.map((w) => D(w));
  const weightSum = weightDecs.reduce((acc, w) => acc.plus(w), D(0));

  // Sin pesos (todos cero): reparto equitativo.
  const shares = weightSum.isZero()
    ? weightDecs.map(() => totalDec.dividedBy(weightDecs.length))
    : weightDecs.map((w) => totalDec.times(w).dividedBy(weightSum));

  const floored = shares.map((s) => s.toDecimalPlaces(decimals, Decimal.ROUND_DOWN));
  const distributed = floored.reduce((acc, s) => acc.plus(s), D(0));
  let remainder = totalDec.toDecimalPlaces(decimals, Decimal.ROUND_HALF_UP).minus(distributed);

  // Índices ordenados por resto descendente; empates por orden original (estable).
  const order = shares
    .map((s, i) => ({ i, rest: s.minus(floored[i] as Decimal) }))
    .sort((a, b) => b.rest.comparedTo(a.rest) || a.i - b.i);

  const result = [...floored];
  let cursor = 0;
  const step = remainder.isNegative() ? unit.negated() : unit;
  while (!remainder.isZero() && order.length > 0) {
    const target = order[cursor % order.length] as { i: number };
    result[target.i] = (result[target.i] as Decimal).plus(step);
    remainder = remainder.minus(step);
    cursor += 1;
    // Guarda contra bucles infinitos por datos corruptos.
    if (cursor > order.length * 1000) break;
  }

  return result.map((r) => money(r, total.currency));
}

// ─── Serialización ───────────────────────────────────────────────────────────

/**
 * Convierte a string plano para persistir en `Decimal128`.
 *
 * Se usa `Decimal.toFixed()` (de decimal.js, exacto y sin notación científica),
 * NO `Number.prototype.toFixed()`, que sí redondea en coma flotante. La regla de
 * lint no distingue ambos por el tipo, así que se desactiva aquí a propósito.
 */
export function toStorageString(m: Money): string {
  // eslint-disable-next-line no-restricted-syntax -- Decimal.toFixed(), no Number.toFixed()
  return toDecimal(m).toFixed();
}

export function isMoney(value: unknown): value is Money {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Money).amount === 'string' &&
    typeof (value as Money).currency === 'string'
  );
}
