import type { Types} from 'mongoose';
import { Schema, model, type HydratedDocument } from 'mongoose';
import type { Importe } from '@geovanny/shared';
import { importeSchema } from './importeSchema.js';

/**
 * Gasto (§17). Guarda sus equivalentes en las tres monedas como todo lo demás,
 * para que el resumen del mes se pueda ver en COP, USD o VES sin recalcular.
 */
export interface Gasto {
  numero: string;
  categoria: string;
  tipo: 'FIJO' | 'VARIABLE';
  descripcion: string;
  /**
   * Lo que hay que recordar de ese gasto y no cabe en el nombre: a quién se le
   * dio, por qué salió más caro, qué quedó pendiente. Se escribe después, sin
   * frenar la anotación.
   */
  observacion: string;
  importe: Importe;
  fecha: Date;
  /** Operación relacionada, si el gasto pertenece a un viaje concreto. */
  operacionId: Types.ObjectId | null;
  estado: 'ACTIVO' | 'ANULADO';
  creadoPor: Types.ObjectId | null;
}

const gastoSchema = new Schema<Gasto>(
  {
    numero: { type: String, required: true, unique: true },
    categoria: { type: String, required: true },
    tipo: { type: String, enum: ['FIJO', 'VARIABLE'], default: 'VARIABLE' },
    descripcion: { type: String, default: '' },
    observacion: { type: String, default: '' },
    importe: { type: importeSchema, required: true },
    fecha: { type: Date, default: () => new Date() },
    operacionId: { type: Schema.Types.ObjectId, ref: 'Operacion', default: null },
    estado: { type: String, enum: ['ACTIVO', 'ANULADO'], default: 'ACTIVO' },
    creadoPor: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

gastoSchema.index({ fecha: -1 });
gastoSchema.index({ categoria: 1, fecha: -1 });

export type GastoDocumento = HydratedDocument<Gasto>;
export const GastoModel = model<Gasto>('Gasto', gastoSchema);
