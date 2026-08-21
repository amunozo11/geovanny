import { Router } from 'express';
import { MONEDAS, type Moneda } from '@geovanny/shared';
import { requireAuth } from '../middleware/auth.js';
import { resumen } from '../services/resumen.service.js';

export const resumenRouter = Router();

resumenRouter.use(requireAuth);

/**
 * Todo el inicio en una sola llamada, en la moneda pedida.
 *
 * Una sola petición y no doce: en el celular del comerciante, cada petición
 * extra se nota (§52).
 */
resumenRouter.get('/', async (req, res) => {
  const pedida = String(req.query.moneda ?? 'COP').toUpperCase();
  const moneda = (MONEDAS as readonly string[]).includes(pedida) ? (pedida as Moneda) : 'COP';

  res.json({ data: await resumen(moneda) });
});
