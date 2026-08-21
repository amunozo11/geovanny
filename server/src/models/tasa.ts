import { Schema, model, type HydratedDocument } from 'mongoose';

/**
 * Tasa del día: dos números.
 *
 * Cada vez que cambia se guarda un registro nuevo, nunca se edita el anterior.
 * Así queda el histórico completo y se puede saber qué tasa regía en cualquier
 * momento pasado (§4). La tasa vigente es simplemente la más reciente.
 */
export interface Tasa {
  /** 1 USD = ? COP */
  usdCop: string;
  /** 1 USD = ? VES */
  usdVes: string;
  mercado: 'OFICIAL' | 'PARALELO' | 'ACORDADA';
  fuente: 'API' | 'MANUAL' | 'ADMINISTRATIVA';
  proveedor: string | null;
  nota: string | null;
  at: Date;
  creadoPor: Schema.Types.ObjectId | null;
}

const tasaSchema = new Schema<Tasa>(
  {
    usdCop: { type: String, required: true },
    usdVes: { type: String, required: true },
    mercado: {
      type: String,
      enum: ['OFICIAL', 'PARALELO', 'ACORDADA'],
      default: 'PARALELO',
    },
    fuente: { type: String, enum: ['API', 'MANUAL', 'ADMINISTRATIVA'], required: true },
    proveedor: { type: String, default: null },
    nota: { type: String, default: null },
    at: { type: Date, default: () => new Date() },
    creadoPor: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

tasaSchema.index({ at: -1 });

export type TasaDocumento = HydratedDocument<Tasa>;
export const TasaModel = model<Tasa>('Tasa', tasaSchema);
