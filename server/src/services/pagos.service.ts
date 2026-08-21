import mongoose, { Types } from 'mongoose';
import { D, crearImporte, type Moneda, type TasaDelDia } from '@geovanny/shared';
import { PagoModel, type Direccion } from '../models/pago.js';
import { OperacionModel } from '../models/operacion.js';
import { PersonaModel } from '../models/persona.js';
import { siguienteNumero } from '../models/contador.js';
import { BusinessRuleError, NotFoundError } from '../lib/errors.js';
import { tasaVigente } from './tasas.service.js';
import { registrarMovimiento } from './cajas.service.js';

export interface RegistrarPago {
  personaId: string;
  direccion: Direccion;
  /** Lo que se recibe o se entrega. */
  monto: string;
  moneda: Moneda;
  /** Moneda de la deuda que se salda. Por defecto, la misma del pago. */
  aplicaA?: Moneda;
  metodo?: string;
  nota?: string | null;
  /**
   * Tasa pactada para este cobro concreto (§21 / RC-29). Si no se envía, se usa
   * la tasa vigente. Queda guardada dentro del importe, así que siempre se puede
   * saber con qué tasa se cobró.
   */
  tasaAcordada?: { usdCop: string; usdVes: string } | null;
  /** Caja donde entra o de donde sale el dinero. */
  cajaId?: string | null;
  /** Fecha del abono, por si se registra un día después. */
  fecha?: string | null;
  creadoPor?: string | null;
}

export async function registrarPago(entrada: RegistrarPago) {
  const monto = D(entrada.monto);
  if (!monto.greaterThan(0)) {
    throw new BusinessRuleError('MONTO_INVALIDO', 'El monto del abono debe ser mayor que cero.');
  }

  const persona = await PersonaModel.findById(entrada.personaId);
  if (!persona) throw new NotFoundError('No se encontró la persona.');

  const vigente = await tasaVigente();
  const tasa: TasaDelDia = entrada.tasaAcordada
    ? {
        usdCop: entrada.tasaAcordada.usdCop,
        usdVes: entrada.tasaAcordada.usdVes,
        mercado: 'ACORDADA',
        fuente: 'MANUAL',
        at: new Date().toISOString(),
      }
    : vigente;

  const importe = crearImporte(monto.toString(), entrada.moneda, tasa);
  const aplicaA = entrada.aplicaA ?? entrada.moneda;
  const montoAplicado = D(importe.eq[aplicaA]);

  const session = await mongoose.startSession();
  try {
    let creado!: Awaited<ReturnType<typeof PagoModel.create>>[number];

    await session.withTransaction(async () => {
      // Se reparte sobre las operaciones pendientes, de la más antigua a la más
      // nueva (RP-19). El usuario ve un solo saldo, como en su cuaderno, pero
      // por dentro queda claro a qué venta se abonó cada peso.
      const pendientes = await OperacionModel.find({
        personaId: persona._id,
        tipo: entrada.direccion === 'ENTRA' ? 'VENTA' : 'COMPRA',
        moneda: aplicaA,
        estado: 'ACTIVA',
        saldo: { $ne: '0' },
      })
        .sort({ fecha: 1 })
        .session(session);

      let restante = montoAplicado;
      const asignaciones: { operacionId: Types.ObjectId; numero: string; monto: string }[] = [];

      for (const operacion of pendientes) {
        if (!restante.greaterThan(0)) break;

        const saldo = D(operacion.saldo);
        const aplicar = restante.greaterThan(saldo) ? saldo : restante;

        await OperacionModel.updateOne(
          { _id: operacion._id },
          {
            $set: {
              pagado: D(operacion.pagado).plus(aplicar).toString(),
              saldo: saldo.minus(aplicar).toString(),
            },
          },
          { session },
        );

        asignaciones.push({
          operacionId: operacion._id,
          numero: operacion.numero,
          monto: aplicar.toString(),
        });
        restante = restante.minus(aplicar);
      }

      const numero = await siguienteNumero(entrada.direccion === 'ENTRA' ? 'P' : 'A', session);

      const [pago] = await PagoModel.create(
        [
          {
            numero,
            direccion: entrada.direccion,
            personaId: persona._id,
            personaNombre: persona.nombre,
            fecha: entrada.fecha ? new Date(entrada.fecha) : new Date(),
            importe,
            aplicaA,
            montoAplicado: montoAplicado.toString(),
            metodo: entrada.metodo ?? 'EFECTIVO',
            asignaciones,
            // Lo que sobra queda a favor: no se pierde ni se rechaza (CN-17).
            aFavor: restante.toString(),
            nota: entrada.nota ?? null,
            creadoPor: entrada.creadoPor ? new Types.ObjectId(entrada.creadoPor) : null,
          },
        ],
        { session },
      );
      creado = pago!;

      // El dinero se mueve en la moneda EN QUE SE PAGÓ, no en la de la deuda:
      // si te dan 300 dólares, lo que entra a la caja son 300 dólares.
      await registrarMovimiento(
        {
          cajaId: entrada.cajaId ?? null,
          moneda: entrada.moneda,
          monto: entrada.direccion === 'ENTRA' ? monto.toString() : monto.negated().toString(),
          tipo: entrada.direccion === 'ENTRA' ? 'INGRESO' : 'EGRESO',
          concepto:
            entrada.direccion === 'ENTRA'
              ? `Abono de ${persona.nombre}`
              : `Abono a ${persona.nombre}`,
          refTipo: 'PAGO',
          refId: creado._id,
          refNumero: numero,
          creadoPor: entrada.creadoPor,
        },
        session,
      );

      const saldoActual = D(persona.saldos[aplicaA] ?? '0');
      await PersonaModel.updateOne(
        { _id: persona._id },
        { $set: { [`saldos.${aplicaA}`]: saldoActual.minus(montoAplicado).toString() } },
        { session },
      );
    });

    return creado;
  } finally {
    await session.endSession();
  }
}

export async function anularPago(id: string, motivo: string) {
  const pago = await PagoModel.findById(id);
  if (!pago) throw new NotFoundError('No se encontró el abono.');
  if (pago.estado === 'ANULADO') {
    throw new BusinessRuleError('YA_ANULADO', 'Este abono ya estaba anulado.');
  }

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      // Se devuelve a cada operación lo que este abono le había aplicado.
      for (const asignacion of pago.asignaciones) {
        const operacion = await OperacionModel.findById(asignacion.operacionId).session(session);
        if (!operacion) continue;

        await OperacionModel.updateOne(
          { _id: operacion._id },
          {
            $set: {
              pagado: D(operacion.pagado).minus(D(asignacion.monto)).toString(),
              saldo: D(operacion.saldo).plus(D(asignacion.monto)).toString(),
            },
          },
          { session },
        );
      }

      const persona = await PersonaModel.findById(pago.personaId).session(session);
      if (persona) {
        const saldoActual = D(persona.saldos[pago.aplicaA] ?? '0');
        await PersonaModel.updateOne(
          { _id: persona._id },
          {
            $set: {
              [`saldos.${pago.aplicaA}`]: saldoActual.plus(D(pago.montoAplicado)).toString(),
            },
          },
          { session },
        );
      }

      await registrarMovimiento(
        {
          moneda: pago.importe.moneda,
          monto:
            pago.direccion === 'ENTRA'
              ? D(pago.importe.monto).negated().toString()
              : D(pago.importe.monto).toString(),
          tipo: pago.direccion === 'ENTRA' ? 'EGRESO' : 'INGRESO',
          concepto: `Anulación del abono ${pago.numero}`,
          refTipo: 'PAGO',
          refId: pago._id,
          refNumero: pago.numero,
          motivo,
        },
        session,
      );

      await PagoModel.updateOne(
        { _id: pago._id },
        { $set: { estado: 'ANULADO', nota: `${pago.nota ?? ''} · ANULADO: ${motivo}`.trim() } },
        { session },
      );
    });
  } finally {
    await session.endSession();
  }

  return PagoModel.findById(id);
}

export async function listarPagos(filtros: {
  personaId?: string;
  direccion?: Direccion;
  limite?: number;
}) {
  const consulta: Record<string, unknown> = { estado: 'ACTIVO' };
  if (filtros.personaId) consulta.personaId = new Types.ObjectId(filtros.personaId);
  if (filtros.direccion) consulta.direccion = filtros.direccion;

  return PagoModel.find(consulta)
    .sort({ fecha: -1 })
    .limit(Math.min(filtros.limite ?? 50, 200));
}
