import type { Importe, Moneda } from '@geovanny/shared';

/** Formas que devuelve la API. Mongoose entrega `id` además de `_id`. */

export interface Persona {
  id: string;
  _id: string;
  nombre: string;
  tipo: 'CLIENTE' | 'PROVEEDOR' | 'TRANSPORTE';
  telefono: string | null;
  notas: string | null;
  saldos: Record<string, string>;
  activo: boolean;
}

export interface Producto {
  id: string;
  _id: string;
  nombre: string;
  unidad: string;
  stock: string;
  stockMinimo: string;
  costoPromedio: string;
  precioVenta: string;
  monedaVenta: Moneda;
  activo: boolean;
}

export interface ItemOperacion {
  nombre: string;
  unidad: string;
  cantidad: string;
  precio: string;
  subtotal: string;
}

export interface Operacion {
  id: string;
  _id: string;
  numero: string;
  tipo: 'VENTA' | 'COMPRA';
  personaNombre: string;
  fecha: string;
  items: ItemOperacion[];
  moneda: Moneda;
  total: Importe;
  pagado: string;
  saldo: string;
  formaPago: 'CONTADO' | 'FIADO' | 'PARCIAL';
  utilidad: string;
  estado: 'ACTIVA' | 'ANULADA';
}

export interface Pago {
  id: string;
  _id: string;
  numero: string;
  direccion: 'ENTRA' | 'SALE';
  personaNombre: string;
  fecha: string;
  importe: Importe;
  aplicaA: Moneda;
  montoAplicado: string;
  metodo: string;
  aFavor: string;
  nota: string | null;
}

export interface Gasto {
  id: string;
  _id: string;
  numero: string;
  categoria: string;
  tipo: 'FIJO' | 'VARIABLE';
  descripcion: string;
  importe: Importe;
  fecha: string;
}

export interface Tasa {
  id?: string;
  usdCop: string;
  usdVes: string;
  mercado: string;
  fuente: string;
  at: string;
  nota?: string | null;
}

export interface Movimiento {
  id: string;
  _id: string;
  productoNombre: string;
  tipo: string;
  cantidad: string;
  stockDespues: string;
  motivo: string | null;
  refNumero: string | null;
  fecha: string;
}

export interface Caja {
  id: string;
  _id: string;
  nombre: string;
  moneda: Moneda;
  tipo: 'EFECTIVO' | 'BANCO' | 'MOVIL' | 'OTRO';
  saldo: string;
  activa: boolean;
  /** Solo lo trae el resumen del inicio: el saldo en la moneda que se está viendo. */
  convertido?: string;
}

export interface MovimientoCaja {
  id: string;
  _id: string;
  cajaNombre: string;
  moneda: Moneda;
  tipo: string;
  monto: string;
  saldoDespues: string;
  concepto: string;
  motivo: string | null;
  fecha: string;
}
