import type { Types } from 'mongoose';
import { Schema, model, type HydratedDocument } from 'mongoose';
import type { Importe, Moneda } from '@geovanny/shared';
import { MONEDAS } from '@geovanny/shared';
import { importeSchema } from './importeSchema.js';

/**
 * Un movimiento de deuda que no viene de una venta ni de un abono.
 *
 * Existe porque el saldo de una persona NO se toca a mano. Igual que el stock
 * se mueve con movimientos y no escribiendo el número (RC-10), la deuda se
 * mueve con documentos: así siempre se puede responder de dónde salió cada peso
 * que alguien debe, que es justo lo que el cuaderno no permite hoy.
 *
 * Van en las dos direcciones, porque una deuda no solo sube:
 *
 * - `PRESTAMO` — plata que salió de la caja. Sube.
 * - `DEUDA` — algo que ya se debía y se está anotando. Sube, sin mover dinero.
 * - `DEVOLUCION` — devolvió mercancía. Baja, y no es un pago: no entró plata,
 *   así que no puede registrarse como abono o el cierre del día cuadraría de
 *   mentira.
 * - `DESCUENTO` — una rebaja acordada o una deuda que se perdona. Baja.
 * - `AJUSTE` — corrige un saldo mal registrado. Va en la dirección que haga
 *   falta, por eso es el único que la lleva explícita.
 */
export const TIPOS_CARGO = ['PRESTAMO', 'DEUDA', 'DEVOLUCION', 'DESCUENTO', 'AJUSTE'] as const;
export type TipoCargo = (typeof TIPOS_CARGO)[number];

/** Si el documento sube la deuda o la baja. */
export const DIRECCIONES_CARGO = ['SUBE', 'BAJA'] as const;
export type DireccionCargo = (typeof DIRECCIONES_CARGO)[number];

/**
 * Hacia dónde mueve la deuda cada tipo. El `AJUSTE` no está porque sirve para
 * las dos cosas y quien lo registra tiene que decirlo.
 */
export const DIRECCION_POR_TIPO: Partial<Record<TipoCargo, DireccionCargo>> = {
  PRESTAMO: 'SUBE',
  DEUDA: 'SUBE',
  DEVOLUCION: 'BAJA',
  DESCUENTO: 'BAJA',
};

export interface Cargo {
  numero: string;
  personaId: Types.ObjectId;
  personaNombre: string;
  tipo: TipoCargo;
  /** `SUBE` o `BAJA`: de nada sirve el monto sin saber hacia dónde va. */
  direccion: DireccionCargo;
  /** Por qué debe esto. Obligatorio: una deuda sin explicación no sirve. */
  concepto: string;
  importe: Importe;
  moneda: Moneda;
  /**
   * Lo que falta por pagar de este cargo. Baja con los abonos.
   *
   * En un cargo `BAJA` siempre es cero: no es algo que se deba, es algo que ya
   * descontó. Así los abonos no intentan saldarlo.
   */
  saldo: string;
  /** `true` si el dinero salió de una caja (préstamo en efectivo). */
  salioDeCaja: boolean;
  fecha: Date;
  nota: string | null;
  estado: 'ACTIVO' | 'ANULADO';
  motivoAnulacion: string | null;
  creadoPor: Types.ObjectId | null;
}

const cargoSchema = new Schema<Cargo>(
  {
    numero: { type: String, required: true, unique: true },
    personaId: { type: Schema.Types.ObjectId, ref: 'Persona', required: true },
    personaNombre: { type: String, required: true },
    tipo: { type: String, enum: TIPOS_CARGO, required: true },
    direccion: { type: String, enum: DIRECCIONES_CARGO, default: 'SUBE' },
    concepto: { type: String, required: true, trim: true },
    importe: { type: importeSchema, required: true },
    moneda: { type: String, enum: MONEDAS, required: true },
    saldo: { type: String, required: true },
    salioDeCaja: { type: Boolean, default: false },
    fecha: { type: Date, default: () => new Date() },
    nota: { type: String, default: null },
    estado: { type: String, enum: ['ACTIVO', 'ANULADO'], default: 'ACTIVO' },
    motivoAnulacion: { type: String, default: null },
    creadoPor: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

cargoSchema.index({ personaId: 1, fecha: -1 });
cargoSchema.index({ estado: 1, moneda: 1, saldo: 1 });
cargoSchema.index({ fecha: -1 });

export type CargoDocumento = HydratedDocument<Cargo>;
export const CargoModel = model<Cargo>('Cargo', cargoSchema);
