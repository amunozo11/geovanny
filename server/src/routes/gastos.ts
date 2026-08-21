import { Router } from 'express';
import { z } from 'zod';
import { MONEDAS, crearImporte } from '@geovanny/shared';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { GastoModel } from '../models/gasto.js';
import { siguienteNumero } from '../models/contador.js';
import { tasaVigente } from '../services/tasas.service.js';
import { registrarMovimiento } from '../services/cajas.service.js';

export const gastosRouter = Router();

gastosRouter.use(requireAuth);

const gastoSchema = z.object({
  categoria: z.string().min(1, 'Elige una categoría').max(40),
  tipo: z.enum(['FIJO', 'VARIABLE']).default('VARIABLE'),
  descripcion: z.string().max(200).default(''),
  monto: z.string().regex(/^\d+(\.\d+)?$/, 'Escribe un número'),
  moneda: z.enum(MONEDAS),
  fecha: z.string().datetime().optional(),
  cajaId: z.string().nullish(),
});

gastosRouter.get('/', async (req, res) => {
  const consulta: Record<string, unknown> = { estado: 'ACTIVO' };
  if (req.query.desde) consulta.fecha = { $gte: new Date(String(req.query.desde)) };

  const gastos = await GastoModel.find(consulta).sort({ fecha: -1 }).limit(200);
  res.json({ data: gastos });
});

gastosRouter.post('/', requirePermission('expense:write'), async (req, res) => {
  const entrada = gastoSchema.parse(req.body);
  const tasa = await tasaVigente();

  const gasto = await GastoModel.create({
    numero: await siguienteNumero('G'),
    categoria: entrada.categoria,
    tipo: entrada.tipo,
    descripcion: entrada.descripcion,
    // El gasto guarda su valor en las tres monedas, como todo lo demás (§17).
    importe: crearImporte(entrada.monto, entrada.moneda, tasa),
    fecha: entrada.fecha ? new Date(entrada.fecha) : new Date(),
    creadoPor: req.user!.id,
  });

  // El gasto sale de la caja: si pagaste el transporte, ese dinero ya no está.
  await registrarMovimiento({
    cajaId: entrada.cajaId ?? null,
    moneda: entrada.moneda,
    monto: `-${entrada.monto}`,
    tipo: 'EGRESO',
    concepto: `${entrada.categoria.toLowerCase()}${entrada.descripcion ? ` · ${entrada.descripcion}` : ''}`,
    refTipo: 'GASTO',
    refId: gasto._id,
    refNumero: gasto.numero,
    creadoPor: req.user!.id,
  });

  res.status(201).json({ data: gasto });
});

gastosRouter.post('/:id/anular', requirePermission('expense:write'), async (req, res) => {
  const gasto = await GastoModel.findByIdAndUpdate(
    String(req.params.id),
    { estado: 'ANULADO' },
    { new: true },
  );
  res.json({ data: gasto });
});
