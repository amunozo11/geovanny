import type { TasaDelDia } from '@geovanny/shared';
import { D } from '@geovanny/shared';
import { TasaModel } from '../models/tasa.js';
import { env } from '../config/env.js';
import { BusinessRuleError, IntegrationError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';

/** Caché corta: la tasa se consulta en cada venta y no cambia cada segundo. */
let cache: { tasa: TasaDelDia; expira: number } | null = null;

function aTasaDelDia(doc: {
  usdCop: string;
  usdVes: string;
  mercado: string;
  fuente: string;
  at: Date;
}): TasaDelDia {
  return {
    usdCop: doc.usdCop,
    usdVes: doc.usdVes,
    mercado: doc.mercado as TasaDelDia['mercado'],
    fuente: doc.fuente as TasaDelDia['fuente'],
    at: doc.at.toISOString(),
  };
}

/**
 * Tasa vigente = la última registrada.
 *
 * Si no hay ninguna, se falla de forma explícita. NUNCA se asume 1:1 ni se
 * inventa un valor: sin tasa no se puede convertir, y una conversión inventada
 * contaminaría todas las cifras del negocio (RC-05, T-24).
 */
export async function tasaVigente(): Promise<TasaDelDia> {
  if (cache && cache.expira > Date.now()) return cache.tasa;

  const doc = await TasaModel.findOne().sort({ at: -1 });
  if (!doc) {
    throw new BusinessRuleError(
      'SIN_TASA',
      'Todavía no hay una tasa registrada. Registra la tasa del día antes de operar.',
      { rule: 'RC-05' },
    );
  }

  const tasa = aTasaDelDia(doc);
  cache = { tasa, expira: Date.now() + 60_000 };
  return tasa;
}

export async function hayTasa(): Promise<boolean> {
  return (await TasaModel.estimatedDocumentCount()) > 0;
}

export async function registrarTasa(input: {
  usdCop: string;
  usdVes: string;
  mercado?: TasaDelDia['mercado'];
  fuente?: TasaDelDia['fuente'];
  proveedor?: string | null;
  nota?: string | null;
  creadoPor?: string | null;
}): Promise<TasaDelDia> {
  for (const [campo, valor] of [
    ['usdCop', input.usdCop],
    ['usdVes', input.usdVes],
  ] as const) {
    if (!D(valor).greaterThan(0)) {
      throw new BusinessRuleError('TASA_INVALIDA', `La tasa ${campo} debe ser mayor que cero.`);
    }
  }

  const doc = await TasaModel.create({
    usdCop: D(input.usdCop).toString(),
    usdVes: D(input.usdVes).toString(),
    mercado: input.mercado ?? 'PARALELO',
    fuente: input.fuente ?? 'MANUAL',
    proveedor: input.proveedor ?? null,
    nota: input.nota ?? null,
    at: new Date(),
    creadoPor: input.creadoPor ?? null,
  });

  cache = null;
  return aTasaDelDia(doc);
}

export async function historial(limite = 30) {
  const docs = await TasaModel.find().sort({ at: -1 }).limit(limite);
  return docs.map((doc) => ({
    id: doc._id.toString(),
    ...aTasaDelDia(doc),
    nota: doc.nota,
    proveedor: doc.proveedor,
  }));
}

async function pedirJson(url: string): Promise<unknown> {
  const control = AbortSignal.timeout(env.RATES_TIMEOUT_MS);
  const respuesta = await fetch(url, { signal: control });
  if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
  return respuesta.json();
}

/**
 * Consulta las tasas en internet.
 *
 * Para el bolívar se usa DolarAPI, que distingue la tasa oficial de la paralela.
 * Una API genérica de divisas devuelve la oficial, que en la práctica está un
 * ~17% por debajo de la que usa el negocio (ver docs/EXCHANGE_RATES.md).
 */
export async function consultarApi(): Promise<{ usdCop: string; usdVes: string; detalle: string }> {
  const errores: string[] = [];
  let usdCop: string | null = null;
  let usdVes: string | null = null;

  try {
    const datos = (await pedirJson(env.RATES_ERAPI_URL)) as { rates?: Record<string, number> };
    const valor = datos.rates?.COP;
    if (typeof valor === 'number') usdCop = String(valor);
    else errores.push('la respuesta de COP no traía el valor esperado');
  } catch (error) {
    errores.push(`COP: ${(error as Error).message}`);
  }

  try {
    const datos = (await pedirJson(env.RATES_DOLARAPI_URL)) as {
      fuente?: string;
      promedio?: number;
    }[];
    const buscada = env.RATES_VES_DEFAULT_MARKET === 'OFICIAL' ? 'oficial' : 'paralelo';
    const encontrada = datos.find((d) => d.fuente === buscada);
    if (typeof encontrada?.promedio === 'number') usdVes = String(encontrada.promedio);
    else errores.push(`no se encontró la tasa ${buscada} del bolívar`);
  } catch (error) {
    errores.push(`VES: ${(error as Error).message}`);
  }

  if (!usdCop || !usdVes) {
    logger.warn({ errores }, 'Falló la consulta de tasas');
    throw new IntegrationError(
      `No se pudieron obtener las tasas automáticamente (${errores.join('; ')}). ` +
        'Regístralas a mano.',
    );
  }

  return {
    usdCop,
    usdVes,
    detalle: `COP por ExchangeRate-API · VES ${env.RATES_VES_DEFAULT_MARKET.toLowerCase()} por DolarAPI`,
  };
}

/** Consulta la API y guarda el resultado como tasa vigente. */
export async function actualizarDesdeApi(creadoPor?: string | null): Promise<TasaDelDia> {
  const { usdCop, usdVes, detalle } = await consultarApi();
  return registrarTasa({
    usdCop,
    usdVes,
    mercado: env.RATES_VES_DEFAULT_MARKET,
    fuente: 'API',
    proveedor: 'dolarapi+erapi',
    nota: detalle,
    creadoPor: creadoPor ?? null,
  });
}

/** Antigüedad de la tasa vigente, para avisar cuando se queda vieja (§41). */
export async function antiguedadHoras(): Promise<number | null> {
  const doc = await TasaModel.findOne().sort({ at: -1 });
  if (!doc) return null;
  return (Date.now() - doc.at.getTime()) / 3_600_000;
}

export function limpiarCache(): void {
  cache = null;
}
