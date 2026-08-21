import type { Types} from 'mongoose';
import { Schema, model, type HydratedDocument } from 'mongoose';
import { MONEDAS, type Moneda } from '@geovanny/shared';

/**
 * Una caja es un sitio donde hay dinero: el efectivo en pesos, el efectivo en
 * bolívares, la cuenta del banco, el pago móvil.
 *
 * Cada caja tiene UNA moneda. No se mezclan pesos y bolívares en el mismo sitio,
 * igual que no se mezclan en el bolsillo.
 */
export const TIPOS_CAJA = ['EFECTIVO', 'BANCO', 'MOVIL', 'OTRO'] as const;
export type TipoCaja = (typeof TIPOS_CAJA)[number];

export interface Caja {
  nombre: string;
  moneda: Moneda;
  tipo: TipoCaja;
  /** Proyección: la verdad son los movimientos, igual que con el inventario. */
  saldo: string;
  activa: boolean;
  orden: number;
}

const cajaSchema = new Schema<Caja>(
  {
    nombre: { type: String, required: true, trim: true },
    moneda: { type: String, enum: MONEDAS, required: true },
    tipo: { type: String, enum: TIPOS_CAJA, default: 'EFECTIVO' },
    saldo: { type: String, default: '0' },
    activa: { type: Boolean, default: true },
    orden: { type: Number, default: 0 },
  },
  { timestamps: true },
);

cajaSchema.index({ nombre: 1 }, { unique: true });
cajaSchema.index({ moneda: 1, activa: 1, orden: 1 });

export type CajaDocumento = HydratedDocument<Caja>;
export const CajaModel = model<Caja>('Caja', cajaSchema);

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Libro de movimientos de caja.
 *
 * El saldo de una caja nunca se edita a mano: se anota un movimiento y el saldo
 * es la consecuencia. Así siempre se puede responder "¿por qué tengo esto?" y
 * recalcularlo desde cero si el conteo no cuadra.
 */
export const TIPOS_MOVIMIENTO_CAJA = ['INGRESO', 'EGRESO', 'TRASLADO', 'AJUSTE'] as const;
export type TipoMovimientoCaja = (typeof TIPOS_MOVIMIENTO_CAJA)[number];

export interface MovimientoCaja {
  cajaId: Types.ObjectId;
  cajaNombre: string;
  moneda: Moneda;
  tipo: TipoMovimientoCaja;
  /** Firmado: positivo entra, negativo sale. */
  monto: string;
  saldoAntes: string;
  saldoDespues: string;
  concepto: string;
  refTipo: 'OPERACION' | 'PAGO' | 'GASTO' | 'TRASLADO' | 'AJUSTE' | null;
  refId: Types.ObjectId | null;
  refNumero: string | null;
  /** Une las dos patas de un traslado entre cajas. */
  trasladoId: string | null;
  /** Tasa usada si el traslado cruzó de una moneda a otra (§16). */
  tasaTraslado: string | null;
  motivo: string | null;
  fecha: Date;
  creadoPor: Types.ObjectId | null;
}

const movimientoCajaSchema = new Schema<MovimientoCaja>(
  {
    cajaId: { type: Schema.Types.ObjectId, ref: 'Caja', required: true },
    cajaNombre: { type: String, required: true },
    moneda: { type: String, enum: MONEDAS, required: true },
    tipo: { type: String, enum: TIPOS_MOVIMIENTO_CAJA, required: true },
    monto: { type: String, required: true },
    saldoAntes: { type: String, required: true },
    saldoDespues: { type: String, required: true },
    concepto: { type: String, required: true },
    refTipo: {
      type: String,
      enum: ['OPERACION', 'PAGO', 'GASTO', 'TRASLADO', 'AJUSTE', null],
      default: null,
    },
    refId: { type: Schema.Types.ObjectId, default: null },
    refNumero: { type: String, default: null },
    trasladoId: { type: String, default: null },
    tasaTraslado: { type: String, default: null },
    motivo: { type: String, default: null },
    fecha: { type: Date, default: () => new Date() },
    creadoPor: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

movimientoCajaSchema.index({ cajaId: 1, fecha: -1 });
movimientoCajaSchema.index({ fecha: -1 });
movimientoCajaSchema.index({ refId: 1 });

export type MovimientoCajaDocumento = HydratedDocument<MovimientoCaja>;
export const MovimientoCajaModel = model<MovimientoCaja>('MovimientoCaja', movimientoCajaSchema);
