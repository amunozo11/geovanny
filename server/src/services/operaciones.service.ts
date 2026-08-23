import mongoose, { Types } from 'mongoose';
import {
  D,
  allocate,
  crearImporte,
  money,
  plural,
  type Moneda,
  type TasaDelDia,
} from '@geovanny/shared';
import { OperacionModel, type Canal, type FormaPago, type TipoOperacion } from '../models/operacion.js';
import { ProductoModel } from '../models/producto.js';
import { PersonaModel } from '../models/persona.js';
import { MovimientoModel } from '../models/movimiento.js';
import { siguienteNumero } from '../models/contador.js';
import { BusinessRuleError, NotFoundError } from '../lib/errors.js';
import { tasaVigente } from './tasas.service.js';
import { registrarMovimiento } from './cajas.service.js';

export interface ItemEntrada {
  productoId: string;
  cantidad: string;
  precio: string;
}

export interface CrearOperacion {
  tipo: TipoOperacion;
  /** Nulo solo en ventas directas (mostrador): no hay cliente al que cargarle nada. */
  personaId?: string | null;
  /** `DIRECTA` = venta total de mostrador, sin cliente. Por defecto, `CLIENTE`. */
  canal?: Canal;
  /** Nombre que se guarda en una venta directa, si se quiere anotar algo. */
  descripcion?: string | null;
  fecha?: string;
  moneda: Moneda;
  items: ItemEntrada[];
  cargue?: { concepto: string; monto: string }[];
  formaPago: FormaPago;
  pagado?: string;
  nota?: string | null;
  creadoPor?: string | null;
  /** Caja donde entra (o de donde sale) el dinero pagado en el acto. */
  cajaId?: string | null;
  /** Si el negocio permite vender sin existencias (RP-14). */
  permitirStockNegativo?: boolean;
}

/** Reparte el cargue del viaje entre los productos, en proporción a su valor (RP-03). */
function repartirCargue(subtotalesCop: string[], cargueTotalCop: string): string[] {
  if (D(cargueTotalCop).isZero()) return subtotalesCop.map(() => '0');
  return allocate(money(cargueTotalCop, 'COP'), subtotalesCop).map((parte) => parte.amount);
}

export async function crearOperacion(entrada: CrearOperacion) {
  if (entrada.items.length === 0) {
    throw new BusinessRuleError('SIN_ITEMS', 'Agrega al menos un producto.');
  }

  const tasa: TasaDelDia = await tasaVigente();
  const esVenta = entrada.tipo === 'VENTA';
  const canal: Canal = entrada.canal ?? 'CLIENTE';
  const esDirecta = canal === 'DIRECTA';

  if (esDirecta && !esVenta) {
    throw new BusinessRuleError(
      'COMPRA_SIN_PROVEEDOR',
      'Un viaje siempre tiene proveedor: solo las ventas pueden ser directas.',
    );
  }

  // Sin cliente no hay a quién cobrarle después, así que una venta directa se
  // paga en el acto. Permitir fiarla crearía una deuda sin dueño.
  if (esDirecta && entrada.formaPago !== 'CONTADO') {
    throw new BusinessRuleError(
      'DIRECTA_NO_FIADA',
      'Una venta total se cobra en el momento. Si el cliente queda debiendo, regístrala como venta a un cliente.',
    );
  }

  const persona = esDirecta ? null : await PersonaModel.findById(entrada.personaId);
  if (!esDirecta && !persona) throw new NotFoundError('No se encontró el cliente o proveedor.');

  const nombreEnLaVenta = persona
    ? persona.nombre
    : (entrada.descripcion?.trim() || 'Venta total');

  const productos = await ProductoModel.find({
    _id: { $in: entrada.items.map((i) => new Types.ObjectId(i.productoId)) },
  });
  const porId = new Map(productos.map((p) => [p._id.toString(), p]));

  // ── Cálculo de líneas ────────────────────────────────────────────────────
  const lineas = entrada.items.map((item) => {
    const producto = porId.get(item.productoId);
    if (!producto) throw new NotFoundError(`No se encontró un producto de la lista.`);

    const cantidad = D(item.cantidad);
    if (!cantidad.greaterThan(0)) {
      throw new BusinessRuleError('CANTIDAD_INVALIDA', `La cantidad de ${producto.nombre} debe ser mayor que cero.`);
    }

    const subtotal = cantidad.times(D(item.precio));
    return {
      producto,
      cantidad: cantidad.toString(),
      precio: D(item.precio).toString(),
      subtotal: subtotal.toString(),
      subtotalCop: crearImporte(subtotal.toString(), entrada.moneda, tasa).eq.COP,
    };
  });

  if (esVenta && !entrada.permitirStockNegativo) {
    for (const linea of lineas) {
      if (D(linea.producto.stock).lessThan(D(linea.cantidad))) {
        throw new BusinessRuleError(
          'SIN_STOCK',
          `Solo quedan ${linea.producto.stock} ${plural(linea.producto.unidad, linea.producto.stock)} de ${linea.producto.nombre}.`,
          { rule: 'RP-14', details: { producto: linea.producto.nombre, disponible: linea.producto.stock } },
        );
      }
    }
  }

  const totalMonto = lineas.reduce((acc, l) => acc.plus(D(l.subtotal)), D(0));
  const cargue = entrada.cargue ?? [];
  const cargueMonto = cargue.reduce((acc, c) => acc.plus(D(c.monto)), D(0));
  const totalConCargue = esVenta ? totalMonto : totalMonto.plus(cargueMonto);

  const total = crearImporte(totalConCargue.toString(), entrada.moneda, tasa);

  // ── Costo real por unidad (solo compras: precio + su parte del cargue) ───
  const cargueCop = crearImporte(cargueMonto.toString(), entrada.moneda, tasa).eq.COP;
  const reparto = esVenta
    ? lineas.map(() => '0')
    : repartirCargue(lineas.map((l) => l.subtotalCop), cargueCop);

  const detalle = lineas.map((linea, indice) => {
    const costoUnitario = esVenta
      ? linea.producto.costoPromedio
      : D(linea.subtotalCop)
          .plus(D(reparto[indice] ?? '0'))
          .dividedBy(D(linea.cantidad))
          .toDecimalPlaces(4)
          .toString();

    return {
      productoId: linea.producto._id,
      nombre: linea.producto.nombre,
      unidad: linea.producto.unidad,
      cantidad: linea.cantidad,
      precio: linea.precio,
      subtotal: linea.subtotal,
      costoUnitario,
    };
  });

  // ── Pago y saldo ─────────────────────────────────────────────────────────
  const pagado =
    entrada.formaPago === 'CONTADO'
      ? totalConCargue
      : entrada.formaPago === 'FIADO'
        ? D(0)
        : D(entrada.pagado ?? '0');

  if (pagado.greaterThan(totalConCargue)) {
    throw new BusinessRuleError('PAGO_MAYOR', 'Lo pagado no puede superar el total.');
  }
  const saldo = totalConCargue.minus(pagado);

  // ── Utilidad congelada (solo ventas) ─────────────────────────────────────
  const costoTotal = detalle.reduce(
    (acc, item) => acc.plus(D(item.costoUnitario).times(D(item.cantidad))),
    D(0),
  );
  const utilidad = esVenta ? D(total.eq.COP).minus(costoTotal) : D(0);

  // ── Escritura atómica: o se guarda todo, o no se guarda nada ─────────────
  const session = await mongoose.startSession();
  try {
    let creada!: Awaited<ReturnType<typeof OperacionModel.create>>[number];

    await session.withTransaction(async () => {
      const numero = await siguienteNumero(esVenta ? 'V' : 'C', session);

      const [operacion] = await OperacionModel.create(
        [
          {
            numero,
            tipo: entrada.tipo,
            canal,
            personaId: persona?._id ?? null,
            personaNombre: nombreEnLaVenta,
            fecha: entrada.fecha ? new Date(entrada.fecha) : new Date(),
            items: detalle,
            cargue,
            moneda: entrada.moneda,
            total,
            pagado: pagado.toString(),
            pagadoInicial: pagado.toString(),
            saldo: saldo.toString(),
            formaPago: entrada.formaPago,
            costoTotal: costoTotal.toString(),
            utilidad: utilidad.toString(),
            nota: entrada.nota ?? null,
            creadoPor: entrada.creadoPor ? new Types.ObjectId(entrada.creadoPor) : null,
          },
        ],
        { session },
      );
      creada = operacion!;

      // Inventario: un movimiento por línea, y el stock como consecuencia.
      for (const [indice, item] of detalle.entries()) {
        const producto = porId.get(item.productoId.toString())!;
        const signo = esVenta ? D(item.cantidad).negated() : D(item.cantidad);
        const stockAntes = D(producto.stock);
        const stockDespues = stockAntes.plus(signo);

        await MovimientoModel.create(
          [
            {
              productoId: producto._id,
              productoNombre: producto.nombre,
              tipo: esVenta ? 'VENTA' : 'COMPRA',
              cantidad: signo.toString(),
              stockAntes: stockAntes.toString(),
              stockDespues: stockDespues.toString(),
              costoUnitario: item.costoUnitario,
              refTipo: 'OPERACION',
              refId: creada._id,
              refNumero: numero,
              fecha: creada.fecha,
              creadoPor: creada.creadoPor,
            },
          ],
          { session },
        );

        const cambios: Record<string, string> = { stock: stockDespues.toString() };

        // En compras se recalcula el costo promedio ponderado (RP-02).
        if (!esVenta) {
          const cantidadNueva = D(item.cantidad);
          const baseAnterior = stockAntes.greaterThan(0)
            ? stockAntes.times(D(producto.costoPromedio))
            : D(0);
          const totalUnidades = stockAntes.greaterThan(0)
            ? stockAntes.plus(cantidadNueva)
            : cantidadNueva;
          cambios.costoPromedio = totalUnidades.greaterThan(0)
            ? baseAnterior
                .plus(cantidadNueva.times(D(item.costoUnitario)))
                .dividedBy(totalUnidades)
                .toDecimalPlaces(4)
                .toString()
            : producto.costoPromedio;
        }

        await ProductoModel.updateOne({ _id: producto._id }, { $set: cambios }, { session });
        void indice;
      }

      // Dinero: lo que se paga en el acto entra o sale de la caja. Va dentro de
      // la misma transacción, así que nunca queda una venta cobrada sin su
      // movimiento de caja, ni al revés.
      if (pagado.greaterThan(0)) {
        await registrarMovimiento(
          {
            cajaId: entrada.cajaId ?? null,
            moneda: entrada.moneda,
            monto: esVenta ? pagado.toString() : pagado.negated().toString(),
            tipo: esVenta ? 'INGRESO' : 'EGRESO',
            concepto: esVenta
              ? `Venta ${numero} · ${nombreEnLaVenta}`
              : `Viaje ${numero} · ${nombreEnLaVenta}`,
            refTipo: 'OPERACION',
            refId: creada._id,
            refNumero: numero,
            creadoPor: entrada.creadoPor,
          },
          session,
        );
      }

      // Deuda: sube el saldo de la persona en la moneda de la operación.
      if (persona && saldo.greaterThan(0)) {
        const actual = D(persona.saldos[entrada.moneda] ?? '0');
        await PersonaModel.updateOne(
          { _id: persona._id },
          { $set: { [`saldos.${entrada.moneda}`]: actual.plus(saldo).toString() } },
          { session },
        );
      }
    });

    return creada;
  } finally {
    await session.endSession();
  }
}

export async function anularOperacion(id: string, motivo: string, usuarioId?: string | null) {
  const operacion = await OperacionModel.findById(id);
  if (!operacion) throw new NotFoundError('No se encontró la operación.');
  if (operacion.estado === 'ANULADA') {
    throw new BusinessRuleError('YA_ANULADA', 'Esta operación ya estaba anulada.');
  }

  // Si ya recibió abonos, anularla dejaría los pagos huérfanos. Se pide
  // deshacer los abonos primero, en vez de arreglarlo por dentro en silencio.
  if (!D(operacion.pagado).isZero() && operacion.formaPago !== 'CONTADO') {
    throw new BusinessRuleError(
      'TIENE_ABONOS',
      'Esta operación ya tiene abonos aplicados. Anula primero los abonos.',
      { rule: 'RP-06' },
    );
  }

  const esVenta = operacion.tipo === 'VENTA';
  const session = await mongoose.startSession();

  try {
    await session.withTransaction(async () => {
      for (const item of operacion.items) {
        const producto = await ProductoModel.findById(item.productoId).session(session);
        if (!producto) continue;

        // Movimiento compensatorio: el inventario queda como estaba (INV-5).
        const signo = esVenta ? D(item.cantidad) : D(item.cantidad).negated();
        const stockAntes = D(producto.stock);
        const stockDespues = stockAntes.plus(signo);

        await MovimientoModel.create(
          [
            {
              productoId: producto._id,
              productoNombre: producto.nombre,
              tipo: 'ANULACION',
              cantidad: signo.toString(),
              stockAntes: stockAntes.toString(),
              stockDespues: stockDespues.toString(),
              costoUnitario: item.costoUnitario,
              refTipo: 'OPERACION',
              refId: operacion._id,
              refNumero: operacion.numero,
              motivo,
              fecha: new Date(),
              creadoPor: usuarioId ? new Types.ObjectId(usuarioId) : null,
            },
          ],
          { session },
        );

        await ProductoModel.updateOne(
          { _id: producto._id },
          { $set: { stock: stockDespues.toString() } },
          { session },
        );
      }

      if (operacion.personaId && D(operacion.saldo).greaterThan(0)) {
        const persona = await PersonaModel.findById(operacion.personaId).session(session);
        if (persona) {
          const actual = D(persona.saldos[operacion.moneda] ?? '0');
          await PersonaModel.updateOne(
            { _id: persona._id },
            {
              $set: {
                [`saldos.${operacion.moneda}`]: actual.minus(D(operacion.saldo)).toString(),
              },
            },
            { session },
          );
        }
      }

      // Si se había cobrado en el acto, ese dinero vuelve por donde vino.
      if (D(operacion.pagado).greaterThan(0)) {
        await registrarMovimiento(
          {
            moneda: operacion.moneda,
            monto: esVenta
              ? D(operacion.pagado).negated().toString()
              : D(operacion.pagado).toString(),
            tipo: esVenta ? 'EGRESO' : 'INGRESO',
            concepto: `Anulación de ${operacion.numero}`,
            refTipo: 'OPERACION',
            refId: operacion._id,
            refNumero: operacion.numero,
            motivo,
            creadoPor: usuarioId,
          },
          session,
        );
      }

      await OperacionModel.updateOne(
        { _id: operacion._id },
        { $set: { estado: 'ANULADA', motivoAnulacion: motivo, saldo: '0' } },
        { session },
      );
    });
  } finally {
    await session.endSession();
  }

  return OperacionModel.findById(id);
}

export async function listarOperaciones(filtros: {
  tipo?: TipoOperacion;
  canal?: Canal;
  personaId?: string;
  desde?: string;
  hasta?: string;
  soloPendientes?: boolean;
  limite?: number;
}) {
  const consulta: Record<string, unknown> = { estado: 'ACTIVA' };
  if (filtros.tipo) consulta.tipo = filtros.tipo;
  if (filtros.canal) consulta.canal = filtros.canal;
  if (filtros.personaId) consulta.personaId = new Types.ObjectId(filtros.personaId);
  if (filtros.soloPendientes) consulta.saldo = { $ne: '0' };
  if (filtros.desde || filtros.hasta) {
    consulta.fecha = {
      ...(filtros.desde ? { $gte: new Date(filtros.desde) } : {}),
      ...(filtros.hasta ? { $lte: new Date(filtros.hasta) } : {}),
    };
  }

  return OperacionModel.find(consulta)
    .sort({ fecha: -1 })
    .limit(Math.min(filtros.limite ?? 50, 200));
}
