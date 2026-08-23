import { Router } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import { MONEDAS } from '@geovanny/shared';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { CargoModel, TIPOS_CARGO } from '../models/cargo.js';
import * as cargos from '../services/cargos.service.js';

/**
 * Deudas que no vienen de una venta: préstamos y cargos manuales.
 *
 * Tienen su propia ruta y no se cuelan como una venta rara, porque no lo son:
 * no mueven inventario y no tienen productos. Lo que sí comparten con una venta
 * es lo importante — suben el saldo del cliente y se saldan con los mismos
 * abonos.
 */
export const cargosRouter = Router();

cargosRouter.use(requireAuth);

const crearSchema = z.object({
  personaId: z.string().min(1, 'Elige la persona'),
  tipo: z.enum(TIPOS_CARGO).default('DEUDA'),
  concepto: z.string().min(1, 'Escribe por qué te queda debiendo').max(120),
  monto: z.string().regex(/^\d+(\.\d+)?$/, 'Escribe un número'),
  moneda: z.enum(MONEDAS),
  salioDeCaja: z.boolean().optional(),
  cajaId: z.string().nullish(),
  fecha: z.string().datetime().nullish(),
  nota: z.string().max(300).nullish(),
});

cargosRouter.get('/', async (req, res) => {
  const consulta: Record<string, unknown> = { estado: 'ACTIVO' };
  if (req.query.personaId) consulta.personaId = new Types.ObjectId(String(req.query.personaId));
  if (req.query.pendientes === 'true') consulta.saldo = { $ne: '0' };

  res.json({ data: await CargoModel.find(consulta).sort({ fecha: -1 }).limit(200) });
});

cargosRouter.post('/', requirePermission('charge:create'), async (req, res) => {
  const entrada = crearSchema.parse(req.body);
  const cargo = await cargos.registrarCargo({ ...entrada, creadoPor: req.user!.id });
  res.status(201).json({ data: cargo });
});

cargosRouter.post('/:id/anular', requirePermission('charge:void'), async (req, res) => {
  const { motivo } = z
    .object({ motivo: z.string().min(3, 'Escribe el motivo').default('Registro equivocado') })
    .parse(req.body ?? {});

  res.json({ data: await cargos.anularCargo(String(req.params.id), motivo, req.user!.id) });
});
