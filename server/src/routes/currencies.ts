import { Router } from 'express';
import { z } from 'zod';
import {
  defaultCurrencyRegistry,
  money,
  convertWith,
  resolveRate,
  type RateQuote,
} from '@geovanny/shared';
import { BusinessRuleError } from '../lib/errors.js';

export const currenciesRouter = Router();

/**
 * Monedas habilitadas. En la Fase 3 pasarán a leerse de la colección
 * `currencies`; hoy salen del registro por defecto (§68: nunca hardcodeadas
 * dentro de la lógica, siempre desde un registro sustituible).
 */
currenciesRouter.get('/', (_req, res) => {
  res.json({ data: defaultCurrencyRegistry.activeList() });
});

const quoteSchema = z.object({
  base: z.string().length(3),
  quote: z.string().length(3),
  rate: z.string().regex(/^-?\d+(\.\d+)?$/, 'La tasa debe ser un número en formato string'),
  market: z.enum(['OFICIAL', 'PARALELO', 'ACORDADA']),
  source: z.enum(['API', 'MANUAL', 'ADMINISTRATIVA']),
  provider: z.string().nullish(),
  effectiveAt: z.string().datetime().optional(),
});

const conversionSchema = z.object({
  // El importe viaja como STRING: un number perdería precisión (§32).
  amount: z.string().regex(/^-?\d+(\.\d+)?$/, 'El importe debe ser un número en formato string'),
  from: z.string().length(3),
  to: z.string().length(3),
  quotes: z.array(quoteSchema).min(1),
  preferredMarkets: z.record(z.enum(['OFICIAL', 'PARALELO', 'ACORDADA'])).optional(),
});

/**
 * Vista previa de una conversión: devuelve el resultado Y de dónde salió.
 * Nunca se convierte "a ciegas": la respuesta siempre dice qué tasa se usó, de
 * qué mercado y si hubo triangulación (§20).
 */
currenciesRouter.post('/preview-conversion', (req, res) => {
  const input = conversionSchema.parse(req.body);
  const source = money(input.amount, input.from);

  try {
    const resolved = resolveRate(input.from, input.to, input.quotes as RateQuote[], {
      preferredMarkets: input.preferredMarkets,
    });
    const converted = convertWith(source, input.to, resolved, defaultCurrencyRegistry);

    res.json({
      data: {
        original: source,
        converted,
        rate: {
          factor: resolved.factor,
          path: resolved.path,
          derived: resolved.derived,
          components: resolved.components.map((component) => ({
            base: component.quote.base,
            quote: component.quote.quote,
            rate: component.quote.rate,
            market: component.quote.market,
            source: component.quote.source,
            provider: component.quote.provider ?? null,
            inverted: component.inverted,
          })),
        },
      },
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'RateUnavailableError') {
      throw new BusinessRuleError('RATE_UNAVAILABLE', error.message, { rule: 'RC-05' });
    }
    throw error;
  }
});
