import { Schema } from 'mongoose';
import { MONEDAS } from '@geovanny/shared';

/**
 * Subdocumento `Importe`: el valor pactado y sus tres equivalentes congelados.
 *
 * Va embebido en toda operación con dinero. Es lo que permite mostrar cualquier
 * pantalla en COP, USD o VES sin recalcular nada, y lo que garantiza que una
 * venta vieja siga mostrando las cifras del día en que se hizo (RC-03, §35).
 */
export const importeSchema = new Schema(
  {
    monto: { type: String, required: true },
    moneda: { type: String, enum: MONEDAS, required: true },
    eq: {
      COP: { type: String, required: true },
      USD: { type: String, required: true },
      VES: { type: String, required: true },
    },
    tasa: {
      usdCop: { type: String, required: true },
      usdVes: { type: String, required: true },
      mercado: { type: String, default: 'PARALELO' },
      fuente: { type: String, default: 'MANUAL' },
      at: { type: String, required: true },
    },
  },
  { _id: false },
);
