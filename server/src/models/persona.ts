import { Schema, model, type HydratedDocument } from 'mongoose';
import { MONEDAS } from '@geovanny/shared';

/**
 * Clientes y proveedores en un solo modelo: `Persona`.
 *
 * Son la misma cosa vista al revés —a uno le debes, el otro te debe— y llevan
 * exactamente los mismos datos y la misma cuenta corriente. Separarlos en dos
 * colecciones duplicaría el modelo, el servicio y la pantalla sin ganar nada.
 *
 * `saldos` guarda una deuda por moneda, porque un mismo cliente puede deber en
 * dólares y en bolívares a la vez, como cuentas independientes (CN-2).
 * Un saldo negativo significa "a favor" (CN-17).
 */
export const TIPOS_PERSONA = ['CLIENTE', 'PROVEEDOR', 'TRANSPORTE'] as const;
export type TipoPersona = (typeof TIPOS_PERSONA)[number];

export interface Persona {
  nombre: string;
  tipo: TipoPersona;
  telefono: string | null;
  notas: string | null;
  /** Deuda por moneda. Positivo = debe; negativo = tiene saldo a favor. */
  saldos: Record<string, string>;
  activo: boolean;
}

const personaSchema = new Schema<Persona>(
  {
    nombre: { type: String, required: true, trim: true },
    tipo: { type: String, enum: TIPOS_PERSONA, required: true },
    telefono: { type: String, default: null },
    notas: { type: String, default: null },
    saldos: {
      type: Object,
      default: () => Object.fromEntries(MONEDAS.map((m) => [m, '0'])),
    },
    activo: { type: Boolean, default: true },
  },
  { timestamps: true, minimize: false },
);

personaSchema.index({ tipo: 1, nombre: 1 }, { unique: true });
personaSchema.index({ tipo: 1, activo: 1 });

export type PersonaDocumento = HydratedDocument<Persona>;
export const PersonaModel = model<Persona>('Persona', personaSchema);
