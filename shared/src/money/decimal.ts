// Import nombrado (no default): con `module: NodeNext` el default de decimal.js
// se resuelve al espacio de nombres del módulo y se pierden los estáticos.
import { Decimal as DecimalJs } from 'decimal.js';

/**
 * Instancia AISLADA de decimal.js.
 *
 * Se usa `clone()` para que la configuración de precisión sea nuestra y no pueda
 * ser alterada por otra librería que importe decimal.js globalmente.
 *
 * - `precision: 28` dígitos significativos: suficiente para multiplicar un monto
 *   en bolívares (8 dígitos) por una tasa de 12 decimales sin perder nada.
 * - `ROUND_HALF_UP` es el redondeo comercial esperado en Colombia y Venezuela.
 * - `toExpNeg/toExpPos` amplios: `toString()` nunca debe devolver notación
 *   científica, porque ese string se persiste y se muestra al usuario.
 *
 * Regla RC-02 / §32: NINGÚN valor monetario se calcula con `number`.
 */
export const Decimal = DecimalJs.clone({
  precision: 28,
  rounding: DecimalJs.ROUND_HALF_UP,
  toExpNeg: -30,
  toExpPos: 40,
});

export type Decimal = InstanceType<typeof Decimal>;

/** Entrada admitida para construir un Decimal. */
export type DecimalInput = string | number | Decimal;

export class PrecisionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PrecisionError';
  }
}

/**
 * Construye un Decimal de forma segura.
 *
 * Acepta `number` ÚNICAMENTE si es un entero seguro (cantidades, contadores,
 * literales). Un `number` fraccionario ya llega con el error de coma flotante
 * incorporado —`0.1 + 0.2 === 0.30000000000000004`—, así que se rechaza y se
 * exige pasar el valor como string.
 */
export function D(value: DecimalInput): Decimal {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new PrecisionError(`Valor numérico no finito: ${value}`);
    }
    if (!Number.isSafeInteger(value)) {
      throw new PrecisionError(
        `Se recibió el number fraccionario o inseguro ${value}. ` +
          'Los valores decimales deben pasarse como string para no perder precisión (RC-02). ' +
          `Usa D('${value}').`,
      );
    }
    return new Decimal(value);
  }
  return new Decimal(value);
}

/**
 * Escotilla de escape explícita y rastreable para los pocos casos en los que un
 * `number` fraccionario es inevitable (p. ej. una respuesta JSON de un proveedor
 * externo de tasas). Se marca `unsafe` a propósito: debe verse en la revisión.
 */
export function unsafeDecimalFromNumber(value: number, context: string): Decimal {
  if (!Number.isFinite(value)) {
    throw new PrecisionError(`Valor numérico no finito desde ${context}: ${value}`);
  }
  // String(value) da la representación decimal más corta que redondea al mismo
  // double, que es lo más fiel que se puede recuperar de un number.
  return new Decimal(String(value));
}

export const ZERO = new Decimal(0);
export const ONE = new Decimal(1);

/** `true` si el valor es un decimal finito válido. */
export function isValidDecimal(value: DecimalInput): boolean {
  try {
    return D(value).isFinite();
  } catch {
    return false;
  }
}
