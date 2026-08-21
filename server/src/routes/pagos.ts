import { Router } from 'express';
import { z } from 'zod';
import { MONEDAS } from '@geovanny/shared';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import * as pagos from '../services/pagos.service.js';

export const pagosRouter = Router();

pagosRouter.use(requireAuth);

const numeroTexto = z.string().regex(/^\d+(\.\d+)?$/, 'Escribe un número');

const registrarSchema = z.object({
  personaId: z.string().min(1),
  direccion: z.enum(['ENTRA', 'SALE']),
  monto: numeroTexto,
  /** Moneda en la que el cliente paga. */
  moneda: z.enum(MONEDAS),
  /** Moneda de la deuda que se salda (§8). Por defecto, la misma. */
  aplicaA: z.enum(MONEDAS).optional(),
  metodo: z.string().max(30).optional(),
  nota: z.string().max(300).nullish(),
  /** Tasa pactada solo para este cobro (§21 / RC-29). */
  tasaAcordada: z
    .object({ usdCop: numeroTexto, usdVes: numeroTexto })
    .nullish(),
  /** Caja donde entra o de donde sale el dinero. */
  cajaId: z.string().nullish(),
  fecha: z.string().datetime().nullish(),
});

pagosRouter.get('/', async (req, res) => {
  const lista = await pagos.listarPagos({
    personaId: req.query.personaId as string | undefined,
    direccion: req.query.direccion as 'ENTRA' | 'SALE' | undefined,
    limite: req.query.limite ? Number(req.query.limite) : undefined,
  });
  res.json({ data: lista });
});

pagosRouter.post('/', requirePermission('payment:create'), async (req, res) => {
  const entrada = registrarSchema.parse(req.body);
  const pago = await pagos.registrarPago({ ...entrada, creadoPor: req.user!.id });
  res.status(201).json({ data: pago });
});

pagosRouter.post('/:id/anular', requirePermission('payment:void'), async (req, res) => {
  const { motivo } = z.object({ motivo: z.string().min(3, 'Escribe el motivo') }).parse(req.body);
  res.json({ data: await pagos.anularPago(String(req.params.id), motivo) });
});
