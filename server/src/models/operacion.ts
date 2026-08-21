import type { Types} from 'mongoose';
import { Schema, model, type HydratedDocument } from 'mongoose';
import type { Importe, Moneda } from '@geovanny/shared';
import { MONEDAS } from '@geovanny/shared';
import { importeSchema } from './importeSchema.js';

/**
 * Una operación con mercancía: **venta** o **compra (viaje)**.
 *
 * Son simétricas —en una sale mercancía y entra deuda del cliente; en la otra
 * entra mercancía y nace deuda con el proveedor—, así que comparten modelo,
 * servicio y pantalla. Un solo camino que mantener y entender.
 */
export const TIPOS_OPERACION = ['VENTA', 'COMPRA'] as const;
export type TipoOperacion = (typeof TIPOS_OPERACION)[number];

export const FORMAS_PAGO = ['CONTADO', 'FIADO', 'PARCIAL'] as const;
export type FormaPago = (typeof FORMAS_PAGO)[number];

export interface ItemOperacion {
  productoId: Types.ObjectId;
  nombre: string;
  unidad: string;
  cantidad: string;
  precio: string;
  subtotal: string;
  /** Costo unitario en COP congelado al vender, para la utilidad (C-3). */
  costoUnitario: string;
}

export interface Operacion {
  numero: string;
  tipo: TipoOperacion;
  personaId: Types.ObjectId;
  personaNombre: string;
  fecha: Date;
  items: ItemOperacion[];
  /** Solo en compras: cargue, transporte y demás costos del viaje (CN-15). */
  cargue: { concepto: string; monto: string }[];
  moneda: Moneda;
  total: Importe;
  /** Total abonado hasta hoy: crece con cada abono posterior. */
  pagado: string;
  /**
   * Lo que se pagó en el momento de la operación. NO cambia nunca.
   * `pagado` sí crece con los abonos, así que no sirve para cerrar un día: el
   * cierre del martes no puede moverse porque el jueves alguien abonó.
   */
  pagadoInicial: string;
  saldo: string;
  formaPago: FormaPago;
  /** Solo en ventas: utilidad congelada, en COP. */
  costoTotal: string;
  utilidad: string;
  nota: string | null;
  estado: 'ACTIVA' | 'ANULADA';
  motivoAnulacion: string | null;
  creadoPor: Types.ObjectId | null;
}

const itemSchema = new Schema<ItemOperacion>(
  {
    productoId: { type: Schema.Types.ObjectId, ref: 'Producto', required: true },
    nombre: { type: String, required: true },
    unidad: { type: String, default: 'BULTO' },
    cantidad: { type: String, required: true },
    precio: { type: String, required: true },
    subtotal: { type: String, required: true },
    costoUnitario: { type: String, default: '0' },
  },
  { _id: false },
);

const operacionSchema = new Schema<Operacion>(
  {
    numero: { type: String, required: true, unique: true },
    tipo: { type: String, enum: TIPOS_OPERACION, required: true },
    personaId: { type: Schema.Types.ObjectId, ref: 'Persona', required: true },
    personaNombre: { type: String, required: true },
    fecha: { type: Date, default: () => new Date() },
    items: { type: [itemSchema], default: [] },
    cargue: {
      type: [new Schema({ concepto: String, monto: String }, { _id: false })],
      default: [],
    },
    moneda: { type: String, enum: MONEDAS, required: true },
    total: { type: importeSchema, required: true },
    pagado: { type: String, default: '0' },
    pagadoInicial: { type: String, default: '0' },
    saldo: { type: String, default: '0' },
    formaPago: { type: String, enum: FORMAS_PAGO, required: true },
    costoTotal: { type: String, default: '0' },
    utilidad: { type: String, default: '0' },
    nota: { type: String, default: null },
    estado: { type: String, enum: ['ACTIVA', 'ANULADA'], default: 'ACTIVA' },
    motivoAnulacion: { type: String, default: null },
    creadoPor: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

operacionSchema.index({ tipo: 1, fecha: -1 });
operacionSchema.index({ personaId: 1, fecha: -1 });
operacionSchema.index({ tipo: 1, estado: 1, saldo: 1 });
operacionSchema.index({ 'items.productoId': 1, fecha: -1 });

export type OperacionDocumento = HydratedDocument<Operacion>;
export const OperacionModel = model<Operacion>('Operacion', operacionSchema);
