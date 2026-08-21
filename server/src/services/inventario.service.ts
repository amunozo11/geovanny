import mongoose, { Types } from 'mongoose';
import { D } from '@geovanny/shared';
import { ProductoModel } from '../models/producto.js';
import { MovimientoModel, type TipoMovimiento } from '../models/movimiento.js';
import { BusinessRuleError, NotFoundError } from '../lib/errors.js';

/**
 * Ajuste manual de existencias (merma, conteo, daño).
 *
 * Exige motivo siempre: un stock que cambia sin explicación es exactamente lo
 * que el sistema viene a eliminar (RC-10).
 */
export async function ajustar(entrada: {
  productoId: string;
  /** Firmada: negativa para merma o pérdida, positiva para un conteo al alza. */
  cantidad: string;
  tipo: TipoMovimiento;
  motivo: string;
  creadoPor?: string | null;
}) {
  const cantidad = D(entrada.cantidad);
  if (cantidad.isZero()) {
    throw new BusinessRuleError('CANTIDAD_CERO', 'La cantidad del ajuste no puede ser cero.');
  }
  if (!entrada.motivo?.trim()) {
    throw new BusinessRuleError('SIN_MOTIVO', 'Escribe el motivo del ajuste.', { rule: 'RC-10' });
  }

  const producto = await ProductoModel.findById(entrada.productoId);
  if (!producto) throw new NotFoundError('No se encontró el producto.');

  const stockAntes = D(producto.stock);
  const stockDespues = stockAntes.plus(cantidad);

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      await MovimientoModel.create(
        [
          {
            productoId: producto._id,
            productoNombre: producto.nombre,
            tipo: entrada.tipo,
            cantidad: cantidad.toString(),
            stockAntes: stockAntes.toString(),
            stockDespues: stockDespues.toString(),
            costoUnitario: producto.costoPromedio,
            refTipo: 'AJUSTE',
            motivo: entrada.motivo.trim(),
            fecha: new Date(),
            creadoPor: entrada.creadoPor ? new Types.ObjectId(entrada.creadoPor) : null,
          },
        ],
        { session },
      );

      await ProductoModel.updateOne(
        { _id: producto._id },
        { $set: { stock: stockDespues.toString() } },
        { session },
      );
    });
  } finally {
    await session.endSession();
  }

  return ProductoModel.findById(entrada.productoId);
}

/** Historial de un producto: por qué su existencia es la que es. */
export async function kardex(productoId: string, limite = 100) {
  return MovimientoModel.find({ productoId: new Types.ObjectId(productoId) })
    .sort({ fecha: -1 })
    .limit(Math.min(limite, 300));
}

/**
 * Recalcula el stock desde los movimientos y avisa si no coincide (INV-1).
 * Es la red de seguridad: si algo se desincroniza, se ve aquí.
 */
export async function verificarStock() {
  const productos = await ProductoModel.find();
  const revisiones = [];

  for (const producto of productos) {
    const movimientos = await MovimientoModel.find({ productoId: producto._id });
    const calculado = movimientos.reduce((acc, m) => acc.plus(D(m.cantidad)), D(0));
    const coincide = calculado.equals(D(producto.stock));

    revisiones.push({
      producto: producto.nombre,
      guardado: producto.stock,
      calculado: calculado.toString(),
      coincide,
    });
  }

  return { todoCorrecto: revisiones.every((r) => r.coincide), revisiones };
}
