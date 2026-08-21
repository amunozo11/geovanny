/**
 * Registro de monedas.
 *
 * §68: las monedas NO se hardcodean. En producción salen de la colección
 * `currencies`. `DEFAULT_CURRENCIES` es solo la semilla de arranque y el valor
 * por defecto del cliente mientras carga la configuración.
 */

export interface CurrencyDef {
  /** Código ISO 4217 (o el que defina el negocio). */
  code: string;
  name: string;
  symbol: string;
  /**
   * Decimales de presentación y de redondeo al persistir.
   * COP: 0 — en el negocio no se manejan centavos de peso.
   * USD y VES: 2.
   */
  decimals: number;
  active: boolean;
  order: number;
}

export const DEFAULT_CURRENCIES: readonly CurrencyDef[] = [
  { code: 'COP', name: 'Peso colombiano', symbol: '$', decimals: 0, active: true, order: 1 },
  { code: 'USD', name: 'Dólar estadounidense', symbol: 'US$', decimals: 2, active: true, order: 2 },
  { code: 'VES', name: 'Bolívar', symbol: 'Bs.', decimals: 2, active: true, order: 3 },
];

export class UnknownCurrencyError extends Error {
  constructor(public readonly code: string) {
    super(`Moneda desconocida: "${code}". No está registrada en el sistema.`);
    this.name = 'UnknownCurrencyError';
  }
}

export class CurrencyMismatchError extends Error {
  constructor(
    public readonly left: string,
    public readonly right: string,
  ) {
    super(
      `No se pueden operar directamente ${left} y ${right}. ` +
        'Convierte primero con una tasa explícita (RC-06).',
    );
    this.name = 'CurrencyMismatchError';
  }
}

/**
 * Catálogo consultable de monedas. Se construye con lo que venga de la base de
 * datos; si no se le pasa nada, arranca con la semilla por defecto.
 */
export class CurrencyRegistry {
  private readonly byCode: Map<string, CurrencyDef>;

  constructor(currencies: readonly CurrencyDef[] = DEFAULT_CURRENCIES) {
    this.byCode = new Map(currencies.map((c) => [c.code.toUpperCase(), c]));
  }

  get(code: string): CurrencyDef {
    const found = this.byCode.get(code.toUpperCase());
    if (!found) throw new UnknownCurrencyError(code);
    return found;
  }

  has(code: string): boolean {
    return this.byCode.has(code.toUpperCase());
  }

  decimalsFor(code: string): number {
    return this.get(code).decimals;
  }

  list(): CurrencyDef[] {
    return [...this.byCode.values()].sort((a, b) => a.order - b.order);
  }

  activeList(): CurrencyDef[] {
    return this.list().filter((c) => c.active);
  }
}

/** Registro por defecto, para arranque y pruebas. */
export const defaultCurrencyRegistry = new CurrencyRegistry();
