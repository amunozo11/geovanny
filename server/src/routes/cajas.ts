import { Router } from 'express';
import { z } from 'zod';
import { MONEDAS } from '@geovanny/shared';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import * as cajas from '../services/cajas.service.js';

export const cajasRouter = Router();

cajasRouter.use(requireAuth);

const numeroTexto = z.string().regex(/^\d+(\.\d+)?$/, 'Escribe un número');

cajasRouter.get('/', async (req, res) => {
  const pedida = String(req.query.moneda ?? '').toUpperCase();
  const moneda = (MONEDAS as readonly string[]).includes(pedida)
    ? (pedida as (typeof MONEDAS)[number])
    : undefined;
  res.json({ data: await cajas.listar(moneda) });
});

cajasRouter.get('/movimientos', async (req, res) => {
  const cajaId = req.query.cajaId ? String(req.query.cajaId) : undefined;
  res.json({ data: await cajas.movimientos(cajaId) });
});

const crearSchema = z.object({
  nombre: z.string().min(1, 'Ponle un nombre').max(60),
  moneda: z.enum(MONEDAS),
  tipo: z.enum(['EFECTIVO', 'BANCO', 'MOVIL', 'OTRO']).optional(),
  saldoInicial: numeroTexto.optional(),
});

cajasRouter.post('/', requirePermission('settings:write'), async (req, res) => {
  const entrada = crearSchema.parse(req.body);
  const caja = await cajas.crear({ ...entrada, creadoPor: req.user!.id });
  res.status(201).json({ data: caja });
});

const ajusteSchema = z.object({
  saldoReal: numeroTexto,
  motivo: z.string().min(1, 'Escribe el motivo'),
});

/** Ajuste por conteo: se dice cuánto hay de verdad y el sistema anota la diferencia. */
cajasRouter.post('/:id/ajuste', requirePermission('settings:write'), async (req, res) => {
  const entrada = ajusteSchema.parse(req.body);
  const caja = await cajas.ajustar({
    cajaId: String(req.params.id),
    ...entrada,
    creadoPor: req.user!.id,
  });
  res.json({ data: caja });
});

const trasladoSchema = z.object({
  origenId: z.string().min(1),
  destinoId: z.string().min(1),
  monto: numeroTexto,
  /** Si las cajas son de monedas distintas, cuánto se recibe realmente (§16). */
  montoDestino: numeroTexto.nullish(),
  concepto: z.string().max(80).nullish(),
});

cajasRouter.post('/traslado', requirePermission('payment:create'), async (req, res) => {
  const entrada = trasladoSchema.parse(req.body);
  res.json({ data: await cajas.trasladar({ ...entrada, creadoPor: req.user!.id }) });
});

cajasRouter.get('/verificar', requirePermission('settings:write'), async (_req, res) => {
  res.json({ data: await cajas.verificar() });
});
