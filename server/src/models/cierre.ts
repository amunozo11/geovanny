import type { Types } from 'mongoose';
import { Schema, model, type HydratedDocument } from 'mongoose';
import type { Moneda } from '@geovanny/shared';
import { MONEDAS } from '@geovanny/shared';

/**
 * El cierre de un día: lo que se contó de verdad al final de la jornada.
 *
 * El sistema puede calcular lo que *debería* haber en la caja, pero solo quien
 * cuenta los billetes sabe lo que hay. Esa diferencia —un billete de menos, un
 * gasto que no se anotó— es información valiosa y se guarda tal cual, sin
 * cuadrarla por dentro.
 *
 * Y sobre todo: el sobrante de hoy es el saldo con el que se arranca mañana.
 * Eso es exactamente lo que hace en el cuaderno cuando escribe abajo "quedaron
 * 300 mil" y al día siguiente empieza contando esos 300 mil.
 */
export interface Cierre {
  /** `2026-08-23`, el día del negocio. Uno por día. */
  dia: string;
  /** Lo que se contó al cerrar, por moneda. */
  sobrante: Record<string, string>;
  observacion: string;
  /**
   * La tasa con la que se cerró el día. Congelada aquí para que el reporte de
   * ese día dé siempre los mismos números, por mucho que el dólar se mueva
   * después (RC-03).
   */
  tasa: {
    usdCop: string;
    usdVes: string;
    mercado: string;
    fuente: string;
    at: string;
  } | null;
  cerradoPor: Types.ObjectId | null;
}

const cierreSchema = new Schema<Cierre>(
  {
    dia: { type: String, required: true, unique: true },
    sobrante: {
      type: Object,
      default: () => Object.fromEntries(MONEDAS.map((m) => [m, '0'])),
    },
    observacion: { type: String, default: '' },
    tasa: {
      type: new Schema(
        {
          usdCop: String,
          usdVes: String,
          mercado: String,
          fuente: String,
          at: String,
        },
        { _id: false },
      ),
      default: null,
    },
    cerradoPor: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true, minimize: false },
);

cierreSchema.index({ dia: -1 });

export type CierreDocumento = HydratedDocument<Cierre>;
export const CierreModel = model<Cierre>('Cierre', cierreSchema);

/** Sobrante en cero, para cuando todavía no hay cierre. */
export const sobranteVacio = (): Record<Moneda, string> =>
  Object.fromEntries(MONEDAS.map((m) => [m, '0'])) as Record<Moneda, string>;
