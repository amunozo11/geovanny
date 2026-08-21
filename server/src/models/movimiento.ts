import type { Types} from 'mongoose';
import { Schema, model, type HydratedDocument } from 'mongoose';

/**
 * Libro mayor del inventario (§10, RC-10).
 *
 * El stock del producto NUNCA se toca a mano: se anota un movimiento y el stock
 * es la consecuencia. Así siempre se puede responder por qué cambió una
 * existencia, y recalcularla entera si hiciera falta.
 */
export const TIPOS_MOVIMIENTO = [
  'COMPRA',
  'VENTA',
  'MERMA',
  'AJUSTE',
  'DEVOLUCION',
  'ANULACION',
] as const;
export type TipoMovimiento = (typeof TIPOS_MOVIMIENTO)[number];

export interface Movimiento {
  productoId: Types.ObjectId;
  productoNombre: string;
  tipo: TipoMovimiento;
  /** Firmado: positivo entra, negativo sale. */
  cantidad: string;
  stockAntes: string;
  stockDespues: string;
  /** Costo unitario en COP en el momento del movimiento. */
  costoUnitario: string;
  refTipo: 'OPERACION' | 'AJUSTE' | null;
  refId: Types.ObjectId | null;
  refNumero: string | null;
  motivo: string | null;
  fecha: Date;
  creadoPor: Types.ObjectId | null;
}

const movimientoSchema = new Schema<Movimiento>(
  {
    productoId: { type: Schema.Types.ObjectId, ref: 'Producto', required: true },
    productoNombre: { type: String, required: true },
    tipo: { type: String, enum: TIPOS_MOVIMIENTO, required: true },
    cantidad: { type: String, required: true },
    stockAntes: { type: String, required: true },
    stockDespues: { type: String, required: true },
    costoUnitario: { type: String, default: '0' },
    refTipo: { type: String, enum: ['OPERACION', 'AJUSTE', null], default: null },
    refId: { type: Schema.Types.ObjectId, default: null },
    refNumero: { type: String, default: null },
    motivo: { type: String, default: null },
    fecha: { type: Date, default: () => new Date() },
    creadoPor: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

movimientoSchema.index({ productoId: 1, fecha: -1 });
movimientoSchema.index({ refId: 1 });
movimientoSchema.index({ fecha: -1 });

export type MovimientoDocumento = HydratedDocument<Movimiento>;
export const MovimientoModel = model<Movimiento>('Movimiento', movimientoSchema);
