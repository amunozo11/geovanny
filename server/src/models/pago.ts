import type { Types} from 'mongoose';
import { Schema, model, type HydratedDocument } from 'mongoose';
import type { Importe, Moneda } from '@geovanny/shared';
import { MONEDAS } from '@geovanny/shared';
import { importeSchema } from './importeSchema.js';

/**
 * Abono. Uno solo para las dos direcciones:
 * - `ENTRA`: el cliente te paga.
 * - `SALE`:  tú le abonas al proveedor.
 *
 * `aplicaA` resuelve el caso del §8: la deuda está en dólares y el cliente paga
 * en bolívares. Se recibe en `importe.moneda` y se descuenta de la deuda en
 * `aplicaA`, usando el equivalente ya congelado. Queda registrado exactamente
 * qué se recibió, a qué se aplicó y con qué tasa.
 */
export const DIRECCIONES = ['ENTRA', 'SALE'] as const;
export type Direccion = (typeof DIRECCIONES)[number];

export interface Pago {
  numero: string;
  direccion: Direccion;
  personaId: Types.ObjectId;
  personaNombre: string;
  fecha: Date;
  /** Lo que efectivamente se recibió o se entregó. */
  importe: Importe;
  /** Moneda de la deuda que se está saldando. */
  aplicaA: Moneda;
  /** Monto descontado de la deuda, en la moneda `aplicaA`. */
  montoAplicado: string;
  metodo: string;
  /** Reparto sobre las operaciones pendientes, de la más antigua a la más nueva. */
  asignaciones: { operacionId: Types.ObjectId; numero: string; monto: string }[];
  /**
   * Reparto sobre las deudas que no vienen de una venta (préstamos y cargos
   * manuales). Van aparte porque apuntan a otra colección, no porque sean otra
   * cosa: para quien abona es la misma deuda.
   */
  asignacionesCargo: { cargoId: Types.ObjectId; numero: string; monto: string }[];
  /** Sobrante que queda como saldo a favor de la persona. */
  aFavor: string;
  nota: string | null;
  confirmado: boolean;
  estado: 'ACTIVO' | 'ANULADO';
  creadoPor: Types.ObjectId | null;
}

const pagoSchema = new Schema<Pago>(
  {
    numero: { type: String, required: true, unique: true },
    direccion: { type: String, enum: DIRECCIONES, required: true },
    personaId: { type: Schema.Types.ObjectId, ref: 'Persona', required: true },
    personaNombre: { type: String, required: true },
    fecha: { type: Date, default: () => new Date() },
    importe: { type: importeSchema, required: true },
    aplicaA: { type: String, enum: MONEDAS, required: true },
    montoAplicado: { type: String, required: true },
    metodo: { type: String, default: 'EFECTIVO' },
    asignaciones: {
      type: [
        new Schema(
          {
            operacionId: { type: Schema.Types.ObjectId, ref: 'Operacion' },
            numero: String,
            monto: String,
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    asignacionesCargo: {
      type: [
        new Schema(
          {
            cargoId: { type: Schema.Types.ObjectId, ref: 'Cargo' },
            numero: String,
            monto: String,
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    aFavor: { type: String, default: '0' },
    nota: { type: String, default: null },
    /** La marca "Ok" que él ya usa a mano junto a cada abono (CN-16). */
    confirmado: { type: Boolean, default: true },
    estado: { type: String, enum: ['ACTIVO', 'ANULADO'], default: 'ACTIVO' },
    creadoPor: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

pagoSchema.index({ personaId: 1, fecha: -1 });
pagoSchema.index({ direccion: 1, fecha: -1 });

export type PagoDocumento = HydratedDocument<Pago>;
export const PagoModel = model<Pago>('Pago', pagoSchema);
