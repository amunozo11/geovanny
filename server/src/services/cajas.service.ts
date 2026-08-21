import mongoose, { Types, type ClientSession } from 'mongoose';
import { randomUUID } from 'node:crypto';
import { D, convert, cotizaciones, money, type Moneda } from '@geovanny/shared';
import {
  CajaModel,
  MovimientoCajaModel,
  type CajaDocumento,
  type TipoCaja,
  type TipoMovimientoCaja,
} from '../models/caja.js';
import { BusinessRuleError, NotFoundError } from '../lib/errors.js';
import { tasaVigente } from './tasas.service.js';

/**
 * Control de caja.
 *
 * **Se activa solo cuando existe al menos una caja.** Si el negocio todavía no
 * ha creado ninguna, las ventas y los abonos funcionan igual y simplemente no se
 * registra el movimiento de dinero. Nadie queda bloqueado por no haber
 * configurado algo, y quien sí quiere llevar la caja la lleva completa.
 */

/** Caja donde cae el dinero de una moneda si no se elige otra. */
async function cajaPorDefecto(
  moneda: Moneda,
  session?: ClientSession,
): Promise<CajaDocumento | null> {
  return CajaModel.findOne({ moneda, activa: true }).sort({ orden: 1, _id: 1 }).session(session ?? null);
}

export interface EntradaMovimiento {
  cajaId?: string | null;
  moneda: Moneda;
  /** Firmado: positivo entra, negativo sale. */
  monto: string;
  tipo: TipoMovimientoCaja;
  concepto: string;
  refTipo?: 'OPERACION' | 'PAGO' | 'GASTO' | 'TRASLADO' | 'AJUSTE' | null;
  refId?: Types.ObjectId | string | null;
  refNumero?: string | null;
  trasladoId?: string | null;
  tasaTraslado?: string | null;
  motivo?: string | null;
  creadoPor?: string | null;
}

/**
 * Anota un movimiento y deja el saldo como consecuencia.
 *
 * Devuelve `null` si no hay ninguna caja en esa moneda: el control de caja está
 * apagado o falta crearla, y eso no debe impedir registrar la venta.
 */
export async function registrarMovimiento(
  entrada: EntradaMovimiento,
  session?: ClientSession,
): Promise<CajaDocumento | null> {
  const monto = D(entrada.monto);
  if (monto.isZero()) return null;

  const caja = entrada.cajaId
    ? await CajaModel.findById(entrada.cajaId).session(session ?? null)
    : await cajaPorDefecto(entrada.moneda, session);

  if (!caja) return null;

  if (caja.moneda !== entrada.moneda) {
    throw new BusinessRuleError(
      'CAJA_OTRA_MONEDA',
      `La caja "${caja.nombre}" es en ${caja.moneda} y la operación es en ${entrada.moneda}. ` +
        'Para mover dinero entre monedas usa un traslado.',
    );
  }

  const saldoAntes = D(caja.saldo);
  const saldoDespues = saldoAntes.plus(monto);

  await MovimientoCajaModel.create(
    [
      {
        cajaId: caja._id,
        cajaNombre: caja.nombre,
        moneda: caja.moneda,
        tipo: entrada.tipo,
        monto: monto.toString(),
        saldoAntes: saldoAntes.toString(),
        saldoDespues: saldoDespues.toString(),
        concepto: entrada.concepto,
        refTipo: entrada.refTipo ?? null,
        refId: entrada.refId ? new Types.ObjectId(String(entrada.refId)) : null,
        refNumero: entrada.refNumero ?? null,
        trasladoId: entrada.trasladoId ?? null,
        tasaTraslado: entrada.tasaTraslado ?? null,
        motivo: entrada.motivo ?? null,
        fecha: new Date(),
        creadoPor: entrada.creadoPor ? new Types.ObjectId(entrada.creadoPor) : null,
      },
    ],
    { session },
  );

  await CajaModel.updateOne(
    { _id: caja._id },
    { $set: { saldo: saldoDespues.toString() } },
    { session },
  );

  return caja;
}

export async function hayCajas(): Promise<boolean> {
  return (await CajaModel.estimatedDocumentCount()) > 0;
}

/**
 * Lista las cajas. Si se pide una moneda de visualización, añade el equivalente
 * de cada saldo a la tasa de hoy — la conversión la hace el servidor para que
 * haya una sola fuente de tasas en todo el sistema.
 */
export async function listar(monedaVista?: Moneda) {
  const cajas = await CajaModel.find({ activa: true }).sort({ orden: 1, nombre: 1 });
  if (!monedaVista) return cajas.map((caja) => caja.toJSON());

  const quotes = cotizaciones(await tasaVigente());
  return cajas.map((caja) => ({
    ...caja.toJSON(),
    convertido: convert(money(caja.saldo, caja.moneda), monedaVista, quotes).amount,
  }));
}

export async function crear(entrada: {
  nombre: string;
  moneda: Moneda;
  tipo?: TipoCaja;
  saldoInicial?: string;
  creadoPor?: string | null;
}) {
  const caja = await CajaModel.create({
    nombre: entrada.nombre,
    moneda: entrada.moneda,
    tipo: entrada.tipo ?? 'EFECTIVO',
    saldo: '0',
  });

  // El saldo inicial entra como un movimiento más, no como un número puesto a
  // mano: así el libro cuadra desde el primer día.
  if (entrada.saldoInicial && !D(entrada.saldoInicial).isZero()) {
    await registrarMovimiento({
      cajaId: caja._id.toString(),
      moneda: caja.moneda,
      monto: entrada.saldoInicial,
      tipo: 'AJUSTE',
      concepto: 'Saldo inicial',
      refTipo: 'AJUSTE',
      motivo: 'Saldo con el que arranca la caja',
      creadoPor: entrada.creadoPor,
    });
  }

  return CajaModel.findById(caja._id);
}

/**
 * Ajuste por conteo: se dice cuánto hay de verdad y el sistema anota la
 * diferencia. Es más natural que pedir la diferencia, que obliga a restar de
 * cabeza y es donde se cometen los errores.
 */
export async function ajustar(entrada: {
  cajaId: string;
  saldoReal: string;
  motivo: string;
  creadoPor?: string | null;
}) {
  if (!entrada.motivo?.trim()) {
    throw new BusinessRuleError('SIN_MOTIVO', 'Escribe el motivo del ajuste.');
  }

  const caja = await CajaModel.findById(entrada.cajaId);
  if (!caja) throw new NotFoundError('No se encontró la caja.');

  const diferencia = D(entrada.saldoReal).minus(D(caja.saldo));
  if (diferencia.isZero()) {
    throw new BusinessRuleError(
      'SIN_DIFERENCIA',
      'El conteo coincide con el saldo: no hay nada que ajustar.',
    );
  }

  await registrarMovimiento({
    cajaId: caja._id.toString(),
    moneda: caja.moneda,
    monto: diferencia.toString(),
    tipo: 'AJUSTE',
    concepto: diferencia.isNegative() ? 'Faltante en el conteo' : 'Sobrante en el conteo',
    refTipo: 'AJUSTE',
    motivo: entrada.motivo.trim(),
    creadoPor: entrada.creadoPor,
  });

  return CajaModel.findById(entrada.cajaId);
}

/**
 * Mover dinero de una caja a otra.
 *
 * Si las cajas son de monedas distintas, esto **es** un cambio de divisa (§16):
 * sale una cantidad de una moneda y entra otra en la otra, con una tasa que
 * queda registrada. Puede pactarse una tasa distinta a la del día, que es lo
 * normal cuando se cambia con alguien de confianza.
 */
export async function trasladar(entrada: {
  origenId: string;
  destinoId: string;
  monto: string;
  /** Cuánto se recibe en la caja destino. Si se omite, se calcula con la tasa del día. */
  montoDestino?: string | null;
  concepto?: string | null;
  creadoPor?: string | null;
}) {
  const monto = D(entrada.monto);
  if (!monto.greaterThan(0)) {
    throw new BusinessRuleError('MONTO_INVALIDO', 'El monto debe ser mayor que cero.');
  }
  if (entrada.origenId === entrada.destinoId) {
    throw new BusinessRuleError('MISMA_CAJA', 'El origen y el destino son la misma caja.');
  }

  const [origen, destino] = await Promise.all([
    CajaModel.findById(entrada.origenId),
    CajaModel.findById(entrada.destinoId),
  ]);
  if (!origen || !destino) throw new NotFoundError('No se encontró alguna de las cajas.');

  if (D(origen.saldo).lessThan(monto)) {
    throw new BusinessRuleError(
      'SALDO_INSUFICIENTE',
      `En "${origen.nombre}" solo hay ${origen.saldo}.`,
    );
  }

  // Cuánto llega al destino: lo indicado, o la conversión con la tasa del día.
  let recibido: string;
  let tasaUsada: string | null = null;

  if (origen.moneda === destino.moneda) {
    recibido = monto.toString();
  } else if (entrada.montoDestino) {
    recibido = D(entrada.montoDestino).toString();
    tasaUsada = D(recibido).dividedBy(monto).toDecimalPlaces(8).toString();
  } else {
    const tasa = await tasaVigente();
    recibido = convert(money(monto.toString(), origen.moneda), destino.moneda, cotizaciones(tasa))
      .amount;
    tasaUsada = D(recibido).dividedBy(monto).toDecimalPlaces(8).toString();
  }

  const trasladoId = randomUUID();
  const concepto =
    entrada.concepto ??
    (origen.moneda === destino.moneda
      ? `Traslado a ${destino.nombre}`
      : `Cambio de ${origen.moneda} a ${destino.moneda}`);

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      await registrarMovimiento(
        {
          cajaId: origen._id.toString(),
          moneda: origen.moneda,
          monto: monto.negated().toString(),
          tipo: 'TRASLADO',
          concepto,
          refTipo: 'TRASLADO',
          trasladoId,
          tasaTraslado: tasaUsada,
          creadoPor: entrada.creadoPor,
        },
        session,
      );

      await registrarMovimiento(
        {
          cajaId: destino._id.toString(),
          moneda: destino.moneda,
          monto: recibido,
          tipo: 'TRASLADO',
          concepto:
            origen.moneda === destino.moneda
              ? `Traslado desde ${origen.nombre}`
              : `Cambio desde ${origen.nombre}`,
          refTipo: 'TRASLADO',
          trasladoId,
          tasaTraslado: tasaUsada,
          creadoPor: entrada.creadoPor,
        },
        session,
      );
    });
  } finally {
    await session.endSession();
  }

  return {
    origen: await CajaModel.findById(entrada.origenId),
    destino: await CajaModel.findById(entrada.destinoId),
    entregado: monto.toString(),
    recibido,
    tasaUsada,
  };
}

export async function movimientos(cajaId?: string, limite = 100) {
  const consulta = cajaId ? { cajaId: new Types.ObjectId(cajaId) } : {};
  return MovimientoCajaModel.find(consulta)
    .sort({ fecha: -1 })
    .limit(Math.min(limite, 300));
}

/** Recalcula los saldos desde los movimientos y avisa si algo no cuadra. */
export async function verificar() {
  const cajas = await CajaModel.find();
  const revisiones = [];

  for (const caja of cajas) {
    const movs = await MovimientoCajaModel.find({ cajaId: caja._id });
    const calculado = movs.reduce((acc, m) => acc.plus(D(m.monto)), D(0));
    revisiones.push({
      caja: caja.nombre,
      guardado: caja.saldo,
      calculado: calculado.toString(),
      coincide: calculado.equals(D(caja.saldo)),
    });
  }

  return { todoCorrecto: revisiones.every((r) => r.coincide), revisiones };
}
