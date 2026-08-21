import { Schema, model, type HydratedDocument } from 'mongoose';
import { MONEDAS, type Moneda } from '@geovanny/shared';

/**
 * Producto (§9).
 *
 * `stock` es una proyección: la verdad está en los movimientos de inventario
 * (RC-10). Se puede recalcular entero desde ellos si alguna vez hay dudas.
 */
export interface Producto {
  nombre: string;
  unidad: string;
  stock: string;
  stockMinimo: string;
  /** Costo promedio ponderado, siempre en COP (moneda funcional, RP-01). */
  costoPromedio: string;
  precioVenta: string;
  monedaVenta: Moneda;
  activo: boolean;
}

const productoSchema = new Schema<Producto>(
  {
    nombre: { type: String, required: true, trim: true },
    unidad: { type: String, default: 'BULTO' },
    stock: { type: String, default: '0' },
    stockMinimo: { type: String, default: '0' },
    costoPromedio: { type: String, default: '0' },
    precioVenta: { type: String, default: '0' },
    monedaVenta: { type: String, enum: MONEDAS, default: 'VES' },
    activo: { type: Boolean, default: true },
  },
  { timestamps: true },
);

productoSchema.index({ nombre: 1 }, { unique: true });
productoSchema.index({ activo: 1, nombre: 1 });

export type ProductoDocumento = HydratedDocument<Producto>;
export const ProductoModel = model<Producto>('Producto', productoSchema);
