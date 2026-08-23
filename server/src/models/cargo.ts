import type { Types } from 'mongoose';
import { Schema, model, type HydratedDocument } from 'mongoose';
import type { Importe, Moneda } from '@geovanny/shared';
import { MONEDAS } from '@geovanny/shared';
import { importeSchema } from './importeSchema.js';

/**
 * Deuda que no viene de una venta: un préstamo en efectivo, una deuda vieja que
 * se pasa al sistema, un servicio cobrado aparte.
 *
 * Existe porque el saldo de un cliente NO se toca a mano. Igual que el stock se
 * mueve con movimientos y no escribiendo el número (RC-10), la deuda se mueve
 * con documentos: así siempre se puede responder de dónde salió cada peso que
 * alguien debe, que es justo lo que el cuaderno no permite hoy.
 *
 * `PRESTAMO` es plata que salió de la caja. `DEUDA` es algo que ya se debía y
 * se está anotando, sin mover dinero. `AJUSTE` corrige un saldo mal registrado.
 */
export const TIPOS_CARGO = ['PRESTAMO', 'DEUDA', 'AJUSTE'] as const;
export type TipoCargo = (typeof TIPOS_CARGO)[number];

export interface Cargo {
  numero: string;
  personaId: Types.ObjectId;
  personaNombre: string;
  tipo: TipoCargo;
  /** Por qué debe esto. Obligatorio: una deuda sin explicación no sirve. */
  concepto: string;
  importe: Importe;
  moneda: Moneda;
  /** Lo que falta por pagar de este cargo. Baja con los abonos. */
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
