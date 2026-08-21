import { Schema, model, type HydratedDocument } from 'mongoose';

/**
 * Catálogos configurables: unidades, categorías y métodos de pago.
 *
 * Una sola colección para los tres porque tienen exactamente la misma forma.
 * Tres colecciones idénticas serían más código sin ninguna ventaja (§68, §69).
 */
export const TIPOS_CATALOGO = ['UNIDAD', 'CATEGORIA_GASTO', 'METODO_PAGO'] as const;
export type TipoCatalogo = (typeof TIPOS_CATALOGO)[number];

export interface Catalogo {
  tipo: TipoCatalogo;
  codigo: string;
  nombre: string;
  activo: boolean;
  orden: number;
}

const catalogoSchema = new Schema<Catalogo>(
  {
    tipo: { type: String, enum: TIPOS_CATALOGO, required: true },
    codigo: { type: String, required: true, uppercase: true, trim: true },
    nombre: { type: String, required: true, trim: true },
    activo: { type: Boolean, default: true },
    orden: { type: Number, default: 0 },
  },
  { timestamps: true },
);

catalogoSchema.index({ tipo: 1, codigo: 1 }, { unique: true });
catalogoSchema.index({ tipo: 1, activo: 1, orden: 1 });

export type CatalogoDocumento = HydratedDocument<Catalogo>;
export const CatalogoModel = model<Catalogo>('Catalogo', catalogoSchema);
