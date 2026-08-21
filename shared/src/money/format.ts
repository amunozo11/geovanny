import type { Money } from './money.js';
import type { CurrencyRegistry } from './currency.js';
import { defaultCurrencyRegistry } from './currency.js';

/**
 * Formateo para pantalla. Separadores en español: 1.080.000,50
 *
 * Se pasa el importe como STRING a `Intl.NumberFormat` (Intl v3, Node 20+) para
 * no degradar la precisión justo antes de mostrarla.
 */
export function formatAmount(
  amount: string,
  currency: string,
  registry: CurrencyRegistry = defaultCurrencyRegistry,
  locale = 'es-CO',
): string {
  const decimals = registry.decimalsFor(currency);
  const formatter = new Intl.NumberFormat(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  try {
    // @ts-expect-error Intl v3 acepta string; el tipado de TS aún no lo refleja.
    return formatter.format(amount);
  } catch {
    return formatter.format(Number(amount));
  }
}

/** `US$ 1.250,00` — el símbolo va delante y separado, como en su archivo. */
export function formatMoney(
  m: Money,
  registry: CurrencyRegistry = defaultCurrencyRegistry,
  locale = 'es-CO',
): string {
  const def = registry.get(m.currency);
  return `${def.symbol} ${formatAmount(m.amount, m.currency, registry, locale)}`;
}

/**
 * Escribe la tasa SIEMPRE con su dirección explícita: "1 USD = 906,8148 VES".
 * Nunca "Tasa: 906,81". Es la defensa contra el error C-1 (tasa invertida).
 */
export function formatRate(
  base: string,
  quote: string,
  rate: string,
  locale = 'es-CO',
  maxDecimals = 6,
): string {
  const value = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: maxDecimals,
  });
  let shown: string;
  try {
    // @ts-expect-error Intl v3 acepta string.
    shown = value.format(rate);
  } catch {
    shown = value.format(Number(rate));
  }
  return `1 ${base.toUpperCase()} = ${shown} ${quote.toUpperCase()}`;
}
