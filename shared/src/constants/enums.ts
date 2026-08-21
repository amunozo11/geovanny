/**
 * Estados y tipos del dominio.
 *
 * Usan el vocabulario del negocio (ANALISIS_CUADERNO.md §8): VIAJE, CARGUE,
 * MERMA, VENTA_DIA, EN_LA_RAYA. La interfaz debe hablar como él habla.
 */

export const USER_ROLES = ['ADMIN', 'VENDEDOR', 'CAJERO', 'CONSULTA'] as const;
export type UserRole = (typeof USER_ROLES)[number];

/** CN-7: `VENTA DIA` = contado · `CLIENTES` = fiado. */
export const PAYMENT_TYPES = ['CONTADO', 'CREDITO', 'PARCIAL'] as const;
export type PaymentType = (typeof PAYMENT_TYPES)[number];

export const DOCUMENT_STATUS = ['ACTIVA', 'ANULADA'] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUS)[number];

export const DEBT_STATUS = ['PENDIENTE', 'PARCIAL', 'PAGADA', 'ANULADA'] as const;
export type DebtStatus = (typeof DEBT_STATUS)[number];

/** RC-11 + D-5/D-7 (mercancía en la raya y merma). */
export const INVENTORY_MOVEMENT_TYPES = [
  'COMPRA',
  'VENTA',
  'DEVOLUCION',
  'AJUSTE_POSITIVO',
  'AJUSTE_NEGATIVO',
  'MERMA',
  'PERDIDA',
  'DANIO',
  'CORRECCION',
  'ANULACION',
  'ENTRADA_TRANSITO',
  'INGRESO_ALMACEN',
] as const;
export type InventoryMovementType = (typeof INVENTORY_MOVEMENT_TYPES)[number];

export const STOCK_LOCATIONS = ['ALMACEN', 'EN_LA_RAYA'] as const;
export type StockLocation = (typeof STOCK_LOCATIONS)[number];

export const SUPPLIER_TYPES = ['MERCANCIA', 'TRANSPORTE'] as const;
export type SupplierType = (typeof SUPPLIER_TYPES)[number];

/** RC-29: al cobrar una deuda vieja el usuario elige, no hay automático. */
export const RATE_MODES = ['ORIGINAL', 'ACTUAL', 'ACORDADA'] as const;
export type RateMode = (typeof RATE_MODES)[number];

/** RP-03: cómo se reparte el cargue entre los productos del viaje. */
export const LANDED_COST_METHODS = ['VALUE', 'QUANTITY', 'WEIGHT'] as const;
export type LandedCostMethod = (typeof LANDED_COST_METHODS)[number];

export const CATALOG_TYPES = [
  'PRODUCT_CATEGORY',
  'EXPENSE_CATEGORY',
  'UNIT',
  'PAYMENT_METHOD',
] as const;
export type CatalogType = (typeof CATALOG_TYPES)[number];

export const EXPENSE_KINDS = ['FIJO', 'VARIABLE'] as const;
export type ExpenseKind = (typeof EXPENSE_KINDS)[number];
