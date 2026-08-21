import { D } from './decimal.js';
import { money, round, sum, type Money } from './money.js';
import { convert, type RateMarket, type RateQuote, type RateSource } from './rates.js';
import { defaultCurrencyRegistry, type CurrencyRegistry } from './currency.js';

/** Las tres monedas del negocio. */
export const MONEDAS = ['COP', 'USD', 'VES'] as const;
export type Moneda = (typeof MONEDAS)[number];

/**
 * Tasa del día: dos números y ya.
 *
 * El negocio solo necesita saber cuánto vale el dólar en pesos y en bolívares.
 * Todo lo demás (COP↔VES) se calcula a partir de ahí. Un modelo genérico de
 * pares de divisas sería más "correcto" en abstracto y mucho peor de entender
 * y de mantener para quien va a usar esto.
 */
export interface TasaDelDia {
  /** 1 USD = ? COP */
  usdCop: string;
  /** 1 USD = ? VES */
  usdVes: string;
  mercado: RateMarket;
  fuente: RateSource;
  at: string;
}

/**
 * Un importe con sus tres valores YA calculados y congelados.
 *
 * Esto es lo que permite mostrar cualquier pantalla en COP, USD o VES sin
 * volver a convertir nada: el valor en las tres monedas se guardó el día de la
 * operación, con la tasa de ese día (RC-03, §35). Cambiar la tasa de hoy no
 * puede alterar una venta de la semana pasada, porque nadie la recalcula.
 */
export interface Importe {
  /** Valor y moneda en que se pactó realmente la operación. */
  monto: string;
  moneda: Moneda;
  /** Equivalentes congelados el día de la operación. */
  eq: Record<Moneda, string>;
  /** Tasa que se usó, para poder explicarla en pantalla. */
  tasa: TasaDelDia;
}

export function cotizaciones(tasa: TasaDelDia): RateQuote[] {
  return [
    {
      base: 'USD',
      quote: 'COP',
      rate: tasa.usdCop,
      market: tasa.mercado,
      source: tasa.fuente,
      effectiveAt: tasa.at,
    },
    {
      base: 'USD',
      quote: 'VES',
      rate: tasa.usdVes,
      market: tasa.mercado,
      source: tasa.fuente,
      effectiveAt: tasa.at,
    },
  ];
}

/** Calcula los tres equivalentes de un monto con la tasa dada. */
export function equivalentes(
  monto: string,
  moneda: Moneda,
  tasa: TasaDelDia,
  registry: CurrencyRegistry = defaultCurrencyRegistry,
): Record<Moneda, string> {
  const quotes = cotizaciones(tasa);
  const origen = money(monto, moneda);
  return {
    COP: convert(origen, 'COP', quotes, {}, registry).amount,
    USD: convert(origen, 'USD', quotes, {}, registry).amount,
    VES: convert(origen, 'VES', quotes, {}, registry).amount,
  };
}

/** Crea un importe congelando sus tres valores. */
export function crearImporte(monto: string, moneda: Moneda, tasa: TasaDelDia): Importe {
  return {
    monto: D(monto).toString(),
    moneda,
    eq: equivalentes(monto, moneda, tasa),
    tasa,
  };
}

/** Lee un importe en la moneda que el usuario tenga seleccionada. */
export function enMoneda(importe: Importe, moneda: Moneda): Money {
  return money(importe.eq[moneda], moneda);
}

/** Suma varios importes en la moneda de visualización elegida. */
export function sumarEn(importes: readonly Importe[], moneda: Moneda): Money {
  return round(sum(importes.map((i) => enMoneda(i, moneda)), moneda));
}

/** Importe en cero, útil para inicializar totales. */
export function importeCero(moneda: Moneda, tasa: TasaDelDia): Importe {
  return crearImporte('0', moneda, tasa);
}

/** Reescala un importe manteniendo la misma tasa (p. ej. tras editar cantidades). */
export function conMonto(importe: Importe, nuevoMonto: string): Importe {
  return crearImporte(nuevoMonto, importe.moneda, importe.tasa);
}
