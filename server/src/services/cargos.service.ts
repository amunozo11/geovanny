import mongoose, { Types } from 'mongoose';
import { D, crearImporte, type Moneda, type TasaDelDia } from '@geovanny/shared';
import { CargoModel, type TipoCargo } from '../models/cargo.js';
import { PersonaModel } from '../models/persona.js';
import { siguienteNumero } from '../models/contador.js';
import { BusinessRuleError, NotFoundError } from '../lib/errors.js';
import { tasaVigente } from './tasas.service.js';
import { registrarMovimiento } from './cajas.service.js';

export interface RegistrarCargo {
  personaId: string;
  tipo: TipoCargo;
  concepto: string;
  monto: string;
  moneda: Moneda;
  /** Solo tiene sentido en un préstamo: de qué caja salió la plata. */
  cajaId?: string | null;
  /** `true` si de verdad salió dinero de la caja. */
  salioDeCaja?: boolean;
  fecha?: string | null;
  nota?: string | null;
  /** Tasa congelada a reutilizar. Solo al corregir, para no revaluar el pasado. */
  tasaOriginal?: TasaDelDia | null;
  creadoPor?: string | null;
}

/**
 * Carga una deuda a una persona sin que haya venta de por medio.
 *
 * Todo pasa en una transacción: nace el cargo y sube el saldo de la persona; si
 * fue un préstamo en efectivo, además sale de la caja. O se guarda entero o no
 * se guarda nada — un saldo que sube sin documento que lo explique sería el
 * mismo problema del cuaderno.
 */
export async function registrarCargo(entrada: RegistrarCargo) {
  const monto = D(entrada.monto);
  if (!monto.greaterThan(0)) {
    throw new BusinessRuleError('MONTO_INVALIDO', 'El monto debe ser mayor que cero.');
  }
  if (!entrada.concepto?.trim()) {
    throw new BusinessRuleError('SIN_CONCEPTO', 'Escribe por qué te queda debiendo esto.');
  }

  const persona = await PersonaModel.findById(entrada.personaId);
  if (!persona) throw new NotFoundError('No se encontró la persona.');

  const tasa = entrada.tasaOriginal ?? (await tasaVigente());
  const importe = crearImporte(monto.toString(), entrada.moneda, tasa);
  // Prestar es entregar plata; anotar una deuda vieja, no. El usuario lo dice,
  // porque solo él sabe si el billete salió del cajón.
  const salioDeCaja = entrada.salioDeCaja ?? entrada.tipo === 'PRESTAMO';

  const session = await mongoose.startSession();
  try {
    let creado!: Awaited<ReturnType<typeof CargoModel.create>>[number];

    await session.withTransaction(async () => {
      const numero = await siguienteNumero('D', session);

      const [cargo] = await CargoModel.create(
        [
          {
            numero,
            personaId: persona._id,
            personaNombre: persona.nombre,
            tipo: entrada.tipo,
            concepto: entrada.concepto.trim(),
            importe,
            moneda: entrada.moneda,
            saldo: monto.toString(),
            salioDeCaja,
            fecha: entrada.fecha ? new Date(entrada.fecha) : new Date(),
            nota: entrada.nota ?? null,
            creadoPor: entrada.creadoPor ? new Types.ObjectId(entrada.creadoPor) : null,
          },
        ],
        { session },
      );
      creado = cargo!;

      if (salioDeCaja) {
        await registrarMovimiento(
          {
            cajaId: entrada.cajaId ?? null,
            moneda: entrada.moneda,
            monto: monto.negated().toString(),
            tipo: 'EGRESO',
            concepto: `${entrada.tipo === 'PRESTAMO' ? 'Préstamo a' : 'Cargo a'} ${persona.nombre} · ${entrada.concepto.trim()}`,
            refTipo: 'AJUSTE',
            refId: creado._id,
            refNumero: numero,
            creadoPor: entrada.creadoPor,
          },
          session,
        );
      }

      const actual = D(persona.saldos[entrada.moneda] ?? '0');
      await PersonaModel.updateOne(
        { _id: persona._id },
        { $set: { [`saldos.${entrada.moneda}`]: actual.plus(monto).toString() } },
        { session },
      );
    });

    return creado;
  } finally {
    await session.endSession();
  }
}

/**
 * Anula un cargo y deshace lo que hizo.
 *
 * Si ya recibió abonos no se toca: deshacerlo dejaría esos abonos apuntando a
 * una deuda que no existe. Se pide anular primero los abonos, igual que con las
 * ventas (RP-06).
 */
export async function anularCargo(id: string, motivo: string, usuarioId?: string | null) {
  const cargo = await CargoModel.findById(id);
  if (!cargo) throw new NotFoundError('No se encontró el cargo.');
  if (cargo.estado === 'ANULADO') {
    throw new BusinessRuleError('YA_ANULADO', 'Este cargo ya estaba anulado.');
  }
  if (!D(cargo.saldo).equals(D(cargo.importe.monto))) {
    throw new BusinessRuleError(
      'TIENE_ABONOS',
      'Este cargo ya tiene abonos aplicados. Anula primero los abonos.',
      { rule: 'RP-06' },
    );
  }

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      if (cargo.salioDeCaja) {
        await registrarMovimiento(
          {
            moneda: cargo.moneda,
            monto: cargo.importe.monto,
            tipo: 'INGRESO',
            concepto: `Anulación de ${cargo.numero}`,
            refTipo: 'AJUSTE',
            refId: cargo._id,
            refNumero: cargo.numero,
            motivo,
            creadoPor: usuarioId,
          },
          session,
        );
      }

      const persona = await PersonaModel.findById(cargo.personaId).session(session);
      if (persona) {
        const actual = D(persona.saldos[cargo.moneda] ?? '0');
        await PersonaModel.updateOne(
          { _id: persona._id },
          {
            $set: {
              [`saldos.${cargo.moneda}`]: actual.minus(D(cargo.importe.monto)).toString(),
            },
          },
          { session },
        );
      }

      await CargoModel.updateOne(
        { _id: cargo._id },
        { $set: { estado: 'ANULADO', motivoAnulacion: motivo, saldo: '0' } },
        { session },
      );
    });
  } finally {
    await session.endSession();
  }

  return CargoModel.findById(id);
}

/**
 * Corregir un cargo ya registrado.
 *
 * Mismo criterio que con los abonos: el concepto y la nota se arreglan en el
 * sitio —una errata no merece dos documentos—, pero si cambia el dinero se
 * anula el original y nace uno nuevo, para que el saldo de la persona y la caja
 * se deshagan por donde vinieron y se rehagan bien.
 *
 * Si ya recibió abonos no se deja: igual que al anular, primero hay que
 * deshacer los abonos (RP-06).
 */
export async function corregirCargo(
  id: string,
  entrada: Partial<RegistrarCargo> & { motivo?: string },
  usuarioId?: string | null,
) {
  const cargo = await CargoModel.findById(id);
  if (!cargo) throw new NotFoundError('No se encontró el cargo.');
  if (cargo.estado === 'ANULADO') {
    throw new BusinessRuleError('YA_ANULADO', 'Este cargo está anulado: no se puede corregir.');
  }

  const nuevo = {
    tipo: entrada.tipo ?? cargo.tipo,
    concepto: entrada.concepto ?? cargo.concepto,
    monto: entrada.monto ?? cargo.importe.monto,
    moneda: entrada.moneda ?? cargo.moneda,
    nota: entrada.nota === undefined ? cargo.nota : entrada.nota,
    fecha: entrada.fecha ?? cargo.fecha.toISOString(),
    salioDeCaja: entrada.salioDeCaja ?? cargo.salioDeCaja,
  };

  const tocaElDinero =
    !D(nuevo.monto).equals(D(cargo.importe.monto)) ||
    nuevo.moneda !== cargo.moneda ||
    nuevo.salioDeCaja !== cargo.salioDeCaja ||
    nuevo.fecha !== cargo.fecha.toISOString() ||
    entrada.cajaId !== undefined;

  if (!tocaElDinero) {
    if (!nuevo.concepto.trim()) {
      throw new BusinessRuleError('SIN_CONCEPTO', 'Escribe por qué te queda debiendo esto.');
    }
    await CargoModel.updateOne(
      { _id: cargo._id },
      { $set: { tipo: nuevo.tipo, concepto: nuevo.concepto.trim(), nota: nuevo.nota } },
    );
    return CargoModel.findById(id);
  }

  const motivo = entrada.motivo?.trim() || 'Corregido';
  await anularCargo(id, motivo, usuarioId);

  const corregido = await registrarCargo({
    personaId: cargo.personaId.toString(),
    tipo: nuevo.tipo,
    concepto: nuevo.concepto,
    monto: nuevo.monto,
    moneda: nuevo.moneda,
    salioDeCaja: nuevo.salioDeCaja,
    cajaId: entrada.cajaId ?? null,
    fecha: nuevo.fecha,
    nota: nuevo.nota,
    // El cargo corregido vale lo que valía su día, no lo que vale hoy.
    tasaOriginal: cargo.importe.tasa,
    creadoPor: usuarioId,
  });

  await CargoModel.updateOne(
    { _id: cargo._id },
    { $set: { nota: `${cargo.nota ?? ''} · Corregido por ${corregido.numero}`.trim() } },
  );

  return corregido;
}
