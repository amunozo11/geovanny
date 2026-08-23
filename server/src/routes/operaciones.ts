import { Router } from 'express';
import { z } from 'zod';
import { MONEDAS } from '@geovanny/shared';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { OperacionModel } from '../models/operacion.js';
import { BusinessRuleError, ForbiddenError, NotFoundError } from '../lib/errors.js';
import { can } from '../config/permissions.js';
import * as operaciones from '../services/operaciones.service.js';

export const operacionesRouter = Router();

operacionesRouter.use(requireAuth);

const numeroTexto = z.string().regex(/^\d+(\.\d+)?$/, 'Escribe un número');

const crearSchema = z.object({
  tipo: z.enum(['VENTA', 'COMPRA']),
  personaId: z.string().min(1, 'Elige el cliente o proveedor').nullish(),
  canal: z.enum(['CLIENTE', 'DIRECTA']).default('CLIENTE'),
  moneda: z.enum(MONEDAS),
  items: z
    .array(
      z.object({
        productoId: z.string().min(1),
        cantidad: numeroTexto,
        precio: numeroTexto,
      }),
    )
    .min(1, 'Agrega al menos un producto'),
  cargue: z.array(z.object({ concepto: z.string().max(60), monto: numeroTexto })).optional(),
  formaPago: z.enum(['CONTADO', 'FIADO', 'PARCIAL']),
  pagado: numeroTexto.optional(),
  fecha: z.string().datetime().optional(),
  nota: z.string().max(300).nullish(),
  /** Caja donde entra o de donde sale lo pagado en el acto. */
  cajaId: z.string().nullish(),
});

operacionesRouter.get('/', async (req, res) => {
  const lista = await operaciones.listarOperaciones({
    tipo: req.query.tipo as 'VENTA' | 'COMPRA' | undefined,
    canal: req.query.canal as 'CLIENTE' | 'DIRECTA' | undefined,
    personaId: req.query.personaId as string | undefined,
    desde: req.query.desde as string | undefined,
    hasta: req.query.hasta as string | undefined,
    soloPendientes: req.query.pendientes === 'true',
    limite: req.query.limite ? Number(req.query.limite) : undefined,
  });
  res.json({ data: lista });
});

operacionesRouter.get('/:id', async (req, res) => {
  const operacion = await OperacionModel.findById(String(req.params.id));
  if (!operacion) throw new NotFoundError('No se encontró la operación.');
  res.json({ data: operacion });
});

operacionesRouter.post('/', async (req, res) => {
  const entrada = crearSchema.parse(req.body);

  // Solo la venta de mostrador puede ir sin persona; un viaje siempre tiene
  // proveedor y una venta a crédito, alguien a quien cobrarle.
  if (!entrada.personaId && entrada.canal !== 'DIRECTA') {
    throw new BusinessRuleError('SIN_PERSONA', 'Elige el cliente o el proveedor.');
  }

  // Vender y comprar exigen permisos distintos.
  const permiso = entrada.tipo === 'VENTA' ? 'sale:create' : 'purchase:create';
  if (!can(req.user!.role, permiso)) {
    throw new ForbiddenError(`Tu rol (${req.user!.role}) no puede registrar esta operación.`);
  }

  const operacion = await operaciones.crearOperacion({
    ...entrada,
    // Se permite vender sin existencias, avisando: así funciona hoy el negocio
    // con el cuaderno, y bloquearlo pararía una venta real (RP-14).
    permitirStockNegativo: req.query.forzar === 'true',
    creadoPor: req.user!.id,
  });

  res.status(201).json({ data: operacion });
});

/**
 * Corregir. La nota se edita en el sitio; tocar la mercancía o el dinero anula
 * la operación y crea otra, para que inventario, caja y deuda se rehagan bien.
 */
operacionesRouter.patch('/:id', requirePermission('sale:void'), async (req, res) => {
  const entrada = z
    .object({
      items: z
        .array(
          z.object({ productoId: z.string().min(1), cantidad: numeroTexto, precio: numeroTexto }),
        )
        .min(1, 'Deja al menos un producto')
        .optional(),
      moneda: z.enum(MONEDAS).optional(),
      cargue: z.array(z.object({ concepto: z.string().max(60), monto: numeroTexto })).optional(),
      fecha: z.string().datetime().optional(),
      nota: z.string().max(300).nullish(),
      cajaId: z.string().nullish(),
      motivo: z.string().max(200).optional(),
    })
    .parse(req.body);

  const operacion = await operaciones.corregirOperacion(
    String(req.params.id),
    { ...entrada, permitirStockNegativo: req.query.forzar === 'true' },
    req.user!.id,
  );

  res.json({ data: operacion });
});

operacionesRouter.post('/:id/anular', requirePermission('sale:void'), async (req, res) => {
  const { motivo } = z.object({ motivo: z.string().min(3, 'Escribe el motivo') }).parse(req.body);
  const operacion = await operaciones.anularOperacion(String(req.params.id), motivo, req.user!.id);
  res.json({ data: operacion });
});
