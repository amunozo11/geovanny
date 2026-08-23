import mongoose, { Types } from 'mongoose';
import { D, crearImporte, type Moneda } from '@geovanny/shared';
import { ProductoModel } from '../models/producto.js';
import { MovimientoModel, type TipoMovimiento } from '../models/movimiento.js';
import { BusinessRuleError, NotFoundError } from '../lib/errors.js';
import { tasaVigente } from './tasas.service.js';

export interface DatosProducto {
  nombre: string;
  unidad: string;
  precioVenta: string;
  monedaVenta: Moneda;
  stockMinimo: string;
}

/**
 * Alta de un producto, diciendo de una vez cuánto hay si ya hay algo.
 *
 * Quien empieza a usar el sistema ya tiene mercancía en el almacén: esa
 * existencia no viene de ningún viaje registrado, así que entra como un
 * movimiento de AJUSTE con el motivo "Existencia inicial". El stock sigue sin
 * tocarse a mano (RC-10): queda un asiento que explica de dónde salió.
 *
 * El costo se pide en la moneda en que se compró y se guarda en COP, la moneda
 * funcional en la que se mide la ganancia (RP-01). Sin costo el sistema creería
 * que la mercancía salió gratis y toda la venta parecería ganancia.
 */
export async function crearProducto(
  entrada: DatosProducto & {
    cantidadInicial?: string | null;
    costoUnitario?: string | null;
    monedaCosto?: Moneda;
    creadoPor?: string | null;
  },
) {
  const nombre = entrada.nombre.trim();

  // Un producto dado de baja conserva su nombre y su historial. Si vuelven a
  // crearlo, se reactiva: fallar con un choque de nombre duplicado no le
  // explicaría a nadie que el producto sigue ahí, escondido.
  const existente = await ProductoModel.findOne({ nombre });
  if (existente?.activo) {
    throw new BusinessRuleError('PRODUCTO_REPETIDO', `Ya tienes un producto llamado "${nombre}".`);
  }

  const cantidad = D(entrada.cantidadInicial ?? '0');
  if (cantidad.isNegative()) {
    throw new BusinessRuleError('CANTIDAD_INVALIDA', 'La cantidad inicial no puede ser negativa.');
  }

  // El costo se convierte a COP con la tasa de hoy, que es el día en que entra.
  let costoCop = '0';
  if (entrada.costoUnitario && !D(entrada.costoUnitario).isZero()) {
    const tasa = await tasaVigente();
    costoCop = crearImporte(entrada.costoUnitario, entrada.monedaCosto ?? 'COP', tasa).eq.COP;
  }

  const datos = {
    nombre,
    unidad: entrada.unidad,
    precioVenta: entrada.precioVenta,
    monedaVenta: entrada.monedaVenta,
    stockMinimo: entrada.stockMinimo,
    activo: true,
  };

  const session = await mongoose.startSession();
  let creadoId!: Types.ObjectId;

  try {
    await session.withTransaction(async () => {
      const producto = existente
        ? (await ProductoModel.findOneAndUpdate(
            { _id: existente._id },
            { $set: datos },
            { new: true, session },
          ))!
        : (await ProductoModel.create([{ ...datos, stock: '0', costoPromedio: '0' }], {
            session,
          }))[0]!;

      creadoId = producto._id;

      if (cantidad.isZero()) {
        if (costoCop !== '0') {
          await ProductoModel.updateOne(
            { _id: producto._id },
            { $set: { costoPromedio: costoCop } },
            { session },
          );
        }
        return;
      }

      const stockAntes = D(producto.stock);
      const stockDespues = stockAntes.plus(cantidad);

      await MovimientoModel.create(
        [
          {
            productoId: producto._id,
            productoNombre: producto.nombre,
            tipo: 'AJUSTE',
            cantidad: cantidad.toString(),
            stockAntes: stockAntes.toString(),
            stockDespues: stockDespues.toString(),
            costoUnitario: costoCop,
            refTipo: 'AJUSTE',
            motivo: 'Existencia inicial al crear el producto',
            fecha: new Date(),
            creadoPor: entrada.creadoPor ? new Types.ObjectId(entrada.creadoPor) : null,
          },
        ],
        { session },
      );

      await ProductoModel.updateOne(
        { _id: producto._id },
        {
          $set: {
            stock: stockDespues.toString(),
            ...(costoCop !== '0' ? { costoPromedio: costoCop } : {}),
          },
        },
        { session },
      );
    });
  } finally {
    await session.endSession();
  }

  return ProductoModel.findById(creadoId);
}

/**
 * Baja de un producto.
 *
 * Si nunca se movió —recién creado, o uno de ejemplo que no se maneja— se borra
 * de verdad: dejarlo desactivado solo ocuparía el nombre y estorbaría el día que
 * quieran volver a usarlo. Si ya tiene historial se desactiva y desaparece de
 * las pantallas, pero sus movimientos siguen ahí: borrarlo rompería las ventas
 * y los viajes en los que aparece.
 */
export async function eliminarProducto(productoId: string) {
  const producto = await ProductoModel.findById(productoId);
  if (!producto) throw new NotFoundError('No se encontró el producto.');

  const movimientos = await MovimientoModel.countDocuments({ productoId: producto._id });
  const definitivo = movimientos === 0 && D(producto.stock).isZero();

  if (definitivo) {
    await ProductoModel.deleteOne({ _id: producto._id });
  } else {
    await ProductoModel.updateOne({ _id: producto._id }, { $set: { activo: false } });
  }

  return { nombre: producto.nombre, definitivo, movimientos, stock: producto.stock };
}

/**
 * Ajuste manual de existencias (merma, conteo, daño).
 *
 * Exige motivo siempre: un stock que cambia sin explicación es exactamente lo
 * que el sistema viene a eliminar (RC-10).
 */
export async function ajustar(entrada: {
  productoId: string;
  /** Firmada: negativa para merma o pérdida, positiva para un conteo al alza. */
  cantidad?: string;
  /**
   * Alternativa a `cantidad`: cuánto hay de verdad después de contar, y el
   * sistema calcula la diferencia. Pedir el resultado del conteo en vez de la
   * diferencia evita la resta mental, que es donde se cometen los errores.
   */
  nuevaCantidad?: string;
  tipo: TipoMovimiento;
  motivo: string;
  creadoPor?: string | null;
}) {
  if (!entrada.motivo?.trim()) {
    throw new BusinessRuleError('SIN_MOTIVO', 'Escribe el motivo del ajuste.', { rule: 'RC-10' });
  }

  const producto = await ProductoModel.findById(entrada.productoId);
  if (!producto) throw new NotFoundError('No se encontró el producto.');

  const stockAntes = D(producto.stock);

  const cantidad =
    entrada.nuevaCantidad !== undefined && entrada.nuevaCantidad !== null
      ? D(entrada.nuevaCantidad).minus(stockAntes)
      : D(entrada.cantidad ?? '0');

  if (cantidad.isZero()) {
    throw new BusinessRuleError(
      'CANTIDAD_CERO',
      entrada.nuevaCantidad
        ? `El conteo coincide con lo que ya había (${producto.stock}): no hay nada que ajustar.`
        : 'La cantidad del ajuste no puede ser cero.',
    );
  }

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
