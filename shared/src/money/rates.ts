import { D, type Decimal } from './decimal.js';
import { type Money, money, round, toDecimal } from './money.js';
import type { CurrencyRegistry } from './currency.js';
import { defaultCurrencyRegistry } from './currency.js';

/**
 * Mercado de la tasa. Es OBLIGATORIO y no tiene valor por defecto implícito:
 * para el bolívar, la oficial y la paralela se diferencian ~17% (verificado el
 * 19/08/2026: 775 vs 907 VES/USD). Ver EXCHANGE_RATES.md §1.
 */
export type RateMarket = 'OFICIAL' | 'PARALELO' | 'ACORDADA';
export type RateSource = 'API' | 'MANUAL' | 'ADMINISTRATIVA';

/**
 * Convención única e inviolable (EXCHANGE_RATES.md §6):
 * `rate` = cuántas unidades de `quote` equivale 1 unidad de `base`.
 *   { base: 'USD', quote: 'VES', rate: '906.8148' }  →  1 USD = 906,8148 VES
 */
export interface RateQuote {
  base: string;
  quote: string;
  rate: string;
  market: RateMarket;
  source: RateSource;
  provider?: string | null;
  /** Id del documento `exchange_rates`, para poder auditar el origen. */
  id?: string | null;
  fetchedAt?: string;
  effectiveAt?: string;
}

export interface RateComponent {
  quote: RateQuote;
  /** `true` si se usó dividiendo, por ser la dirección contraria a la almacenada. */
  inverted: boolean;
}

export interface ResolvedRate {
  from: string;
  to: string;
  /** Factor por el que hay que multiplicar un importe en `from` para obtener `to`. */
  factor: string;
  /** Camino recorrido, p. ej. ['VES','USD','COP'] si hubo triangulación. */
  path: string[];
  /** `true` si no existía una tasa directa y hubo que derivarla. */
  derived: boolean;
  components: RateComponent[];
}

export interface ResolveOptions {
  /**
   * Mercado exigido por moneda, p. ej. `{ VES: 'PARALELO' }` (regla RC-30b).
   * Si una moneda aparece aquí, solo se aceptan tasas de ese mercado.
   */
  preferredMarkets?: Record<string, RateMarket>;
  /** Moneda puente para triangular. USD por defecto (EXCHANGE_RATES.md §5). */
  pivot?: string;
}

export class RateUnavailableError extends Error {
  constructor(
    public readonly from: string,
    public readonly to: string,
    public readonly detail?: string,
  ) {
    super(
      `No hay tasa disponible para convertir ${from} → ${to}` +
        (detail ? ` (${detail})` : '') +
        '. Registra una tasa manual antes de continuar (RC-05).',
    );
    this.name = 'RateUnavailableError';
  }
}

const norm = (c: string): string => c.toUpperCase();

function marketAllows(quote: RateQuote, opts: ResolveOptions): boolean {
  const preferred = opts.preferredMarkets ?? {};
  for (const code of [quote.base, quote.quote]) {
    const required = preferred[norm(code)];
    if (required && quote.market !== required && quote.market !== 'ACORDADA') return false;
  }
  return true;
}

/** Ordena de más reciente a más antigua para quedarnos con la vigente. */
function byRecency(a: RateQuote, b: RateQuote): number {
  return (b.effectiveAt ?? b.fetchedAt ?? '').localeCompare(a.effectiveAt ?? a.fetchedAt ?? '');
}

/** Busca una tasa utilizable en cualquiera de las dos direcciones. */
function findLeg(
  from: string,
  to: string,
  quotes: readonly RateQuote[],
  opts: ResolveOptions,
): RateComponent | null {
  const usable = quotes.filter((q) => marketAllows(q, opts)).sort(byRecency);

  const direct = usable.find((q) => norm(q.base) === from && norm(q.quote) === to);
  if (direct) return { quote: direct, inverted: false };

  // Dirección contraria: se DIVIDE por la tasa almacenada.
  // Nunca se guarda ni se transporta la tasa invertida ya redondeada; se calcula
  // aquí con 28 dígitos de precisión (EXCHANGE_RATES.md §6, regla 1).
  const reverse = usable.find((q) => norm(q.base) === to && norm(q.quote) === from);
  if (reverse) return { quote: reverse, inverted: true };

  return null;
}

function legFactor(leg: RateComponent): Decimal {
  const rate = D(leg.quote.rate);
  if (rate.isZero()) {
    throw new RateUnavailableError(leg.quote.base, leg.quote.quote, 'la tasa almacenada es 0');
  }
  return leg.inverted ? D(1).dividedBy(rate) : rate;
}

/**
 * Resuelve el factor de conversión entre dos monedas.
 *
 * 1. Misma moneda → factor 1.
 * 2. Tasa directa (o su inversa exacta).
 * 3. Triangulación por la moneda puente (USD), marcada como `derived`.
 * 4. Si no hay camino → `RateUnavailableError`. NUNCA se asume 1:1 (test T-24).
 */
export function resolveRate(
  fromCode: string,
  toCode: string,
  quotes: readonly RateQuote[],
  opts: ResolveOptions = {},
): ResolvedRate {
  const from = norm(fromCode);
  const to = norm(toCode);
  const pivot = norm(opts.pivot ?? 'USD');

  if (from === to) {
    return { from, to, factor: '1', path: [from], derived: false, components: [] };
  }

  const direct = findLeg(from, to, quotes, opts);
  if (direct) {
    return {
      from,
      to,
      factor: legFactor(direct).toString(),
      path: [from, to],
      derived: direct.inverted,
      components: [direct],
    };
  }

  if (from !== pivot && to !== pivot) {
    const first = findLeg(from, pivot, quotes, opts);
    const second = findLeg(pivot, to, quotes, opts);
    if (first && second) {
      return {
        from,
        to,
        factor: legFactor(first).times(legFactor(second)).toString(),
        path: [from, pivot, to],
        derived: true,
        components: [first, second],
      };
    }
  }

  throw new RateUnavailableError(from, to, `no hay tasa directa ni triangulable por ${pivot}`);
}

/**
 * Convierte un importe usando una tasa ya resuelta.
 * El redondeo se aplica una sola vez, al final, según los decimales del destino.
 */
export function convertWith(
  amount: Money,
  to: string,
  resolved: ResolvedRate,
  registry: CurrencyRegistry = defaultCurrencyRegistry,
): Money {
  const target = norm(to);
  if (norm(resolved.from) !== norm(amount.currency) || norm(resolved.to) !== target) {
    throw new RateUnavailableError(
      amount.currency,
      target,
      `la tasa resuelta es ${resolved.from}→${resolved.to}`,
    );
  }
  return round(money(toDecimal(amount).times(D(resolved.factor)), target), registry);
}

/** Atajo: resuelve y convierte en un paso. */
export function convert(
  amount: Money,
  to: string,
  quotes: readonly RateQuote[],
  opts: ResolveOptions = {},
  registry: CurrencyRegistry = defaultCurrencyRegistry,
): Money {
  return convertWith(amount, to, resolveRate(amount.currency, to, quotes, opts), registry);
}

/**
 * Calcula los equivalentes de un importe en varias monedas, para congelarlos en
 * el `RateSnapshot` de la operación (RC-03 / §35). Se calcula UNA vez y no se
 * vuelve a tocar: es lo que hace que una venta vieja siga mostrando sus cifras.
 */
export function buildEquivalents(
  amount: Money,
  targets: readonly string[],
  quotes: readonly RateQuote[],
  opts: ResolveOptions = {},
  registry: CurrencyRegistry = defaultCurrencyRegistry,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const target of targets) {
    out[norm(target)] = convert(amount, target, quotes, opts, registry).amount;
  }
  return out;
}

/** Copia inmutable del contexto cambiario de una operación (DATABASE.md §0). */
export interface RateSnapshot {
  functionalCurrency: string;
  rates: RateQuote[];
  equivalents: Record<string, string>;
  capturedAt: string;
}

export function captureSnapshot(
  amount: Money,
  params: {
    functionalCurrency: string;
    targets: readonly string[];
    quotes: readonly RateQuote[];
    options?: ResolveOptions;
    registry?: CurrencyRegistry;
    capturedAt?: Date;
  },
): RateSnapshot {
  const { functionalCurrency, targets, quotes, options = {}, registry } = params;
  const used = new Map<string, RateQuote>();

  for (const target of targets) {
    const resolved = resolveRate(amount.currency, target, quotes, options);
    for (const component of resolved.components) {
      used.set(
        `${component.quote.base}/${component.quote.quote}/${component.quote.market}`,
        component.quote,
      );
    }
  }

  return {
    functionalCurrency: norm(functionalCurrency),
    rates: [...used.values()],
    equivalents: buildEquivalents(amount, targets, quotes, options, registry),
    capturedAt: (params.capturedAt ?? new Date()).toISOString(),
  };
}
