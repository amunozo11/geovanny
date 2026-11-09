import mongoose, { Types } from 'mongoose';
import { D, crearImporte, type Decimal, type Moneda } from '@geovanny/shared';
import { ProductoModel } from '../models/producto.js';
import { MovimientoModel, type TipoMovimiento } from '../models/movimiento.js';
import { BusinessRuleError, NotFoundError } from '../lib/errors.js';
import { tasaVigente } from './tasas.service.js';
import { diaDeHoy, rangoDelDia } from '../lib/dias.js';

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

/**
 * Las existencias de un día: con cuánto se arrancó, qué se movió y cómo quedó.
 *
 * El stock de un producto es la suma de sus movimientos (RC-10), así que el de
 * cualquier momento se puede reconstruir sumando los anteriores. Eso permite
 * responder la pregunta que hoy no se puede: *"¿con cuánto arranqué hoy y con
 * cuánto arranqué ayer?"*, y ver si lo que falta se explica con lo que salió o
 * si hay un hueco.
 *
 * No se guarda ninguna foto diaria: se calcula. Una foto se desincroniza en
 * cuanto alguien corrige un movimiento viejo; esto siempre cuadra con el libro.
 */
export async function existenciasDelDia(dia: string) {
  const { desde, hasta } = rangoDelDia(dia);

  const productos = await ProductoModel.find({ activo: true }).sort({ nombre: 1 });
  const ids = productos.map((p) => p._id);

  const [despues, enElDia] = await Promise.all([
    MovimientoModel.find(
      { productoId: { $in: ids }, fecha: { $gte: hasta } },
      { productoId: 1, cantidad: 1 },
    ),
    MovimientoModel.find({ productoId: { $in: ids }, fecha: { $gte: desde, $lt: hasta } }).sort({
      fecha: 1,
    }),
  ]);

  /**
   * Se cuenta hacia atrás desde el stock de ahora, no hacia delante desde cero.
   *
   * Sumar los movimientos anteriores al día daría el número equivocado para un
   * producto cuyo stock no salió entero del libro —uno creado con existencias
   * ya puestas, o traído de una importación—. Partiendo de lo que hay hoy y
   * deshaciendo lo posterior, la cifra siempre cuadra con lo que la persona ve
   * en el inventario, que es contra lo que va a comparar.
   */
  const posteriorPor = new Map<string, Decimal>();
  for (const m of despues) {
    const clave = m.productoId.toString();
    posteriorPor.set(clave, (posteriorPor.get(clave) ?? D(0)).plus(D(m.cantidad)));
  }

  const filas = productos.map((producto) => {
    const clave = producto._id.toString();
    const suyos = enElDia.filter((m) => m.productoId.toString() === clave);

    const entro = suyos
      .filter((m) => D(m.cantidad).greaterThan(0))
      .reduce((acc, m) => acc.plus(D(m.cantidad)), D(0));
    const salio = suyos
      .filter((m) => D(m.cantidad).isNegative())
      .reduce((acc, m) => acc.plus(D(m.cantidad).abs()), D(0));

    const final = D(producto.stock).minus(posteriorPor.get(clave) ?? D(0));
    const inicial = final.minus(entro).plus(salio);

    return {
      id: clave,
      nombre: producto.nombre,
      unidad: producto.unidad,
      inicial: inicial.toString(),
      entro: entro.toString(),
      salio: salio.toString(),
      final: final.toString(),
      /** Lo que tiene el producto ahora mismo, para poder contrastar. */
      actual: producto.stock,
      movimientos: suyos.map((m) => ({
        id: m._id.toString(),
        tipo: m.tipo,
        cantidad: m.cantidad,
        motivo: m.motivo,
        refNumero: m.refNumero,
        fecha: m.fecha,
      })),
    };
  });

  return {
    dia,
    esHoy: dia === diaDeHoy(),
    productos: filas.filter(
      (f) => f.movimientos.length > 0 || !D(f.inicial).isZero() || !D(f.final).isZero(),
    ),
  };
}
