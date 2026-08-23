import { Router } from 'express';
import { z } from 'zod';
import { MONEDAS } from '@geovanny/shared';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { diaDeHoy } from '../lib/dias.js';
import * as ventasTotales from '../services/ventasTotales.service.js';
import { anularOperacion } from '../services/operaciones.service.js';

/**
 * Ventas totales (mostrador), en su propio apartado.
 *
 * Por dentro son ventas normales con canal `DIRECTA`, así que cuentan en el
 * inicio, en el cierre del día y en el inventario como cualquier otra. Lo que
 * cambia es cómo se registran y cómo se leen: producto por producto, sin
 * cliente, y con un corte del día en las tres monedas.
 */
export const ventasTotalesRouter = Router();

ventasTotalesRouter.use(requireAuth);

const numeroTexto = z.string().regex(/^\d+(\.\d+)?$/, 'Escribe un número');

const lineaSchema = z.object({
  productoId: z.string().min(1, 'Elige el producto'),
  cantidad: numeroTexto,
  precio: numeroTexto,
  moneda: z.enum(MONEDAS),
  cajaId: z.string().nullish(),
  nota: z.string().max(300).nullish(),
  fecha: z.string().datetime().optional(),
  forzar: z.boolean().optional(),
});

ventasTotalesRouter.get('/', async (req, res) => {
  const dia = String(req.query.dia ?? '') || diaDeHoy();
  res.json({ data: await ventasTotales.delDia(dia) });
});

ventasTotalesRouter.post('/', requirePermission('sale:create'), async (req, res) => {
  const linea = lineaSchema.parse(req.body);
  const venta = await ventasTotales.registrar(linea, req.user!.id);
  res.status(201).json({ data: venta });
});

/** Varias de golpe: cada una se guarda por separado y se informa cuál falló. */
ventasTotalesRouter.post('/lote', requirePermission('sale:create'), async (req, res) => {
  const { lineas } = z
    .object({ lineas: z.array(lineaSchema).min(1, 'No hay nada que guardar').max(50) })
    .parse(req.body);

  res.status(201).json({ data: await ventasTotales.registrarLote(lineas, req.user!.id) });
});

ventasTotalesRouter.post('/:id/anular', requirePermission('sale:void'), async (req, res) => {
  const { motivo } = z
    .object({ motivo: z.string().min(3, 'Escribe el motivo').default('Registro equivocado') })
    .parse(req.body ?? {});

  const venta = await anularOperacion(String(req.params.id), motivo, req.user!.id);
  res.json({ data: venta });
});
