import { Router } from 'express';
import { z } from 'zod';
import { MONEDAS } from '@geovanny/shared';
import { ProductoModel } from '../models/producto.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { BusinessRuleError, NotFoundError } from '../lib/errors.js';
import * as inventario from '../services/inventario.service.js';

export const productosRouter = Router();

productosRouter.use(requireAuth);

const numeroTexto = z.string().regex(/^\d+(\.\d+)?$/, 'Escribe un número');

const productoSchema = z.object({
  nombre: z.string().min(1, 'El nombre es obligatorio').max(80),
  unidad: z.string().max(20).default('BULTO'),
  precioVenta: numeroTexto.default('0'),
  monedaVenta: z.enum(MONEDAS).default('VES'),
  stockMinimo: numeroTexto.default('0'),
});

/**
 * Al crear se puede decir de una vez cuánto hay y a cómo salió, porque quien
 * empieza a usar el sistema ya tiene mercancía en el almacén. No entra a mano:
 * el servicio lo anota como "existencia inicial" en el libro de inventario.
 */
const crearSchema = productoSchema.extend({
  cantidadInicial: numeroTexto.nullish(),
  costoUnitario: numeroTexto.nullish(),
  monedaCosto: z.enum(MONEDAS).default('COP'),
});

productosRouter.get('/', async (req, res) => {
  const busqueda = String(req.query.q ?? '').trim();
  const consulta: Record<string, unknown> = { activo: true };
  if (busqueda) consulta.nombre = { $regex: busqueda, $options: 'i' };

  const productos = await ProductoModel.find(consulta).sort({ nombre: 1 }).limit(200);
  res.json({ data: productos });
});

productosRouter.post('/', requirePermission('product:write'), async (req, res) => {
  const entrada = crearSchema.parse(req.body);
  const producto = await inventario.crearProducto({ ...entrada, creadoPor: req.user!.id });
  res.status(201).json({ data: producto });
});

productosRouter.patch('/:id', requirePermission('product:write'), async (req, res) => {
  // El stock NO se edita aquí: solo cambia con movimientos (RC-10).
  const entrada = productoSchema.partial().parse(req.body);
  if (entrada.nombre) entrada.nombre = entrada.nombre.trim();

  // Dos productos con el mismo nombre serían indistinguibles en la pantalla de
  // vender, así que se avisa antes de que Mongo lo rechace con su propio error.
  if (entrada.nombre) {
    const repetido = await ProductoModel.findOne({
      nombre: entrada.nombre,
      _id: { $ne: String(req.params.id) },
    });
    if (repetido) {
      throw new BusinessRuleError(
        'PRODUCTO_REPETIDO',
        `Ya tienes un producto llamado "${entrada.nombre}".`,
      );
    }
  }

  const producto = await ProductoModel.findByIdAndUpdate(String(req.params.id), entrada, {
    new: true,
  });
  if (!producto) throw new NotFoundError('No se encontró el producto.');
  res.json({ data: producto });
});

productosRouter.delete('/:id', requirePermission('product:write'), async (req, res) => {
  res.json({ data: await inventario.eliminarProducto(String(req.params.id)) });
});

const ajusteSchema = z
  .object({
    cantidad: z.string().regex(/^-?\d+(\.\d+)?$/, 'Escribe una cantidad').optional(),
    /** Cuánto hay de verdad tras contar; el sistema saca la diferencia. */
    nuevaCantidad: numeroTexto.optional(),
    tipo: z.enum(['MERMA', 'AJUSTE', 'DEVOLUCION']).default('AJUSTE'),
    motivo: z.string().min(1, 'Escribe el motivo'),
  })
  .refine((v) => v.cantidad !== undefined || v.nuevaCantidad !== undefined, {
    message: 'Indica la cantidad del ajuste o cuánto hay de verdad',
    path: ['cantidad'],
  });

productosRouter.post('/:id/ajuste', requirePermission('inventory:adjust'), async (req, res) => {
  const entrada = ajusteSchema.parse(req.body);
  const producto = await inventario.ajustar({
    productoId: String(req.params.id),
    ...entrada,
    creadoPor: req.user!.id,
  });
  res.json({ data: producto });
});

productosRouter.get('/verificar-stock', requirePermission('inventory:adjust'), async (_req, res) => {
  res.json({ data: await inventario.verificarStock() });
});

productosRouter.get('/:id/movimientos', async (req, res) => {
  res.json({ data: await inventario.kardex(String(req.params.id)) });
});
