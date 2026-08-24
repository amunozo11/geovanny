import mongoose, { Types } from 'mongoose';
import { crearImporte, type Moneda } from '@geovanny/shared';
import { GastoModel } from '../models/gasto.js';
import { MovimientoCajaModel } from '../models/caja.js';
import { siguienteNumero } from '../models/contador.js';
import { BusinessRuleError, NotFoundError } from '../lib/errors.js';
import { tasaVigente } from './tasas.service.js';
import { registrarMovimiento } from './cajas.service.js';

export interface RegistrarGasto {
  categoria: string;
  tipo?: 'FIJO' | 'VARIABLE';
  descripcion?: string;
  monto: string;
  moneda: Moneda;
  fecha?: string;
  cajaId?: string | null;
  creadoPor?: string | null;
}

/**
 * Anota un gasto y lo saca de la caja, en una sola transacción.
 *
 * Las dos cosas van juntas o no va ninguna: un gasto anotado sin su salida de
 * caja hace que el cierre del día cuadre de mentira, y una salida sin gasto deja
 * plata que se fue sin que nadie sepa en qué.
 */
export async function registrarGasto(entrada: RegistrarGasto) {
  const tasa = await tasaVigente();

  const session = await mongoose.startSession();
  try {
    let creado!: Awaited<ReturnType<typeof GastoModel.create>>[number];

    await session.withTransaction(async () => {
      const numero = await siguienteNumero('G', session);

      const [gasto] = await GastoModel.create(
        [
          {
            numero,
            categoria: entrada.categoria,
            tipo: entrada.tipo ?? 'VARIABLE',
            descripcion: entrada.descripcion ?? '',
            // El gasto guarda su valor en las tres monedas, como todo (§17).
            importe: crearImporte(entrada.monto, entrada.moneda, tasa),
            fecha: entrada.fecha ? new Date(entrada.fecha) : new Date(),
            creadoPor: entrada.creadoPor ? new Types.ObjectId(entrada.creadoPor) : null,
          },
        ],
        { session },
      );
      creado = gasto!;

      // Si pagaste el transporte, ese dinero ya no está.
      await registrarMovimiento(
        {
          cajaId: entrada.cajaId ?? null,
          moneda: entrada.moneda,
          monto: `-${entrada.monto}`,
          tipo: 'EGRESO',
          concepto: `${entrada.categoria.toLowerCase()}${entrada.descripcion ? ` · ${entrada.descripcion}` : ''}`,
          refTipo: 'GASTO',
          refId: creado._id,
          refNumero: numero,
          creadoPor: entrada.creadoPor,
        },
        session,
      );
    });

    return creado;
  } finally {
    await session.endSession();
  }
}

/**
 * Quita un gasto mal anotado y **devuelve la plata a la caja de donde salió**.
 *
 * Antes solo marcaba el gasto como anulado. La caja se quedaba con el dinero
 * descontado para siempre, así que el cierre del día pedía contar menos billetes
 * de los que había y la diferencia aparecía como un sobrante que nadie sabía
 * explicar.
 *
 * Vuelve a la caja concreta de la que salió —no a la que hoy sea la primera de
 * esa moneda—, buscándola por el movimiento original.
 */
export async function anularGasto(id: string, motivo: string, usuarioId?: string | null) {
  const gasto = await GastoModel.findById(id);
  if (!gasto) throw new NotFoundError('No se encontró el gasto.');
  if (gasto.estado === 'ANULADO') {
    throw new BusinessRuleError('YA_ANULADO', 'Este gasto ya estaba anulado.');
  }

  const original = await MovimientoCajaModel.findOne({ refTipo: 'GASTO', refId: gasto._id });

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      // Si no hubo movimiento —no había cajas creadas cuando se anotó— tampoco
      // hay nada que devolver.
      if (original) {
        await registrarMovimiento(
          {
            cajaId: original.cajaId.toString(),
            moneda: gasto.importe.moneda,
            monto: gasto.importe.monto,
            tipo: 'INGRESO',
            concepto: `Anulación del gasto ${gasto.numero}`,
            refTipo: 'GASTO',
            refId: gasto._id,
            refNumero: gasto.numero,
            motivo,
            creadoPor: usuarioId,
          },
          session,
        );
      }

      await GastoModel.updateOne(
        { _id: gasto._id },
        { $set: { estado: 'ANULADO' } },
        { session },
      );
    });
  } finally {
    await session.endSession();
  }

  return GastoModel.findById(id);
}
