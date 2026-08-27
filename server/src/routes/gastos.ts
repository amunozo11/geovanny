import { Router } from 'express';
import { z } from 'zod';
import { MONEDAS } from '@geovanny/shared';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { GastoModel } from '../models/gasto.js';
import * as gastos from '../services/gastos.service.js';

export const gastosRouter = Router();

gastosRouter.use(requireAuth);

const gastoSchema = z.object({
  categoria: z.string().min(1, 'Elige una categoría').max(40),
  tipo: z.enum(['FIJO', 'VARIABLE']).default('VARIABLE'),
  descripcion: z.string().max(200).default(''),
  observacion: z.string().max(500).default(''),
  monto: z.string().regex(/^\d+(\.\d+)?$/, 'Escribe un número'),
  moneda: z.enum(MONEDAS),
  fecha: z.string().datetime().optional(),
  cajaId: z.string().nullish(),
});

gastosRouter.get('/', async (req, res) => {
  const consulta: Record<string, unknown> = { estado: 'ACTIVO' };
  if (req.query.desde) consulta.fecha = { $gte: new Date(String(req.query.desde)) };

  const lista = await GastoModel.find(consulta).sort({ fecha: -1 }).limit(200);
  res.json({ data: lista });
});

/**
 * Los nombres que ya se han usado, del más repetido al menos.
 *
 * En la práctica los gastos del día son siempre los mismos: luisma, jose, el
 * carro, la caleta. Volver a teclearlos cada vez —y escribirlos distinto cada
 * vez, que es lo que rompe cualquier reporte— no tiene sentido pudiendo
 * ofrecerlos ya escritos.
 */
gastosRouter.get('/nombres', async (_req, res) => {
  const filas = await GastoModel.aggregate<{ _id: string; nombre: string; veces: number }>([
    { $match: { estado: 'ACTIVO', descripcion: { $nin: ['', null] } } },
    {
      $group: {
        // Se agrupa sin distinguir mayúsculas para que "Luisma" y "LUISMA" no
        // salgan como dos gastos distintos.
        _id: { $toUpper: '$descripcion' },
        nombre: { $first: '$descripcion' },
        veces: { $sum: 1 },
        ultima: { $max: '$fecha' },
      },
    },
    { $sort: { veces: -1, ultima: -1 } },
    { $limit: 40 },
  ]);

  res.json({ data: filas.map((f) => ({ nombre: f.nombre, veces: f.veces })) });
});

gastosRouter.post('/', requirePermission('expense:write'), async (req, res) => {
  const entrada = gastoSchema.parse(req.body);
  const gasto = await gastos.registrarGasto({ ...entrada, creadoPor: req.user!.id });
  res.status(201).json({ data: gasto });
});

/** La observación se escribe después y no mueve dinero: se edita en el sitio. */
gastosRouter.patch('/:id', requirePermission('expense:write'), async (req, res) => {
  const { observacion } = z
    .object({ observacion: z.string().max(500).default('') })
    .parse(req.body);

  res.json({ data: await gastos.anotarObservacion(String(req.params.id), observacion) });
});

/** Quitar un gasto mal anotado: devuelve la plata a la caja de donde salió. */
gastosRouter.post('/:id/anular', requirePermission('expense:write'), async (req, res) => {
  const { motivo } = z
    .object({ motivo: z.string().max(200).default('Anotado por equivocación') })
    .parse(req.body ?? {});

  res.json({ data: await gastos.anularGasto(String(req.params.id), motivo, req.user!.id) });
});
