import type { Importe, Moneda, TasaDelDia } from '@geovanny/shared';

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
  productoId: string;
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
  /** `DIRECTA` = venta total de mostrador, sin cliente detrás. */
  canal?: 'CLIENTE' | 'DIRECTA';
  /** Nulo en las ventas de mostrador: no hay cliente detrás. */
  personaId: string | null;
  personaNombre: string;
  fecha: string;
  items: ItemOperacion[];
  moneda: Moneda;
  total: Importe;
  pagado: string;
  saldo: string;
  formaPago: 'CONTADO' | 'FIADO' | 'PARCIAL';
  /** Lo que se cobró en el acto. No cambia con los abonos posteriores. */
  pagadoInicial: string;
  utilidad: string;
  nota: string | null;
  estado: 'ACTIVA' | 'ANULADA';
  motivoAnulacion?: string | null;
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
  /** A qué ventas o compras se aplicó, y cuánto a cada una. */
  asignaciones: { operacionId: string; numero: string; monto: string }[];
  /** Lo mismo para las deudas sueltas: préstamos y cargos manuales. */
  asignacionesCargo: { cargoId: string; numero: string; monto: string }[];
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

/** Lo que devuelve el apartado de ventas totales para un día. */
export interface VentaTotalRegistrada {
  id: string;
  numero: string;
  hora: string;
  fecha: string;
  nota: string | null;
  items: { nombre: string; unidad: string; cantidad: string; precio: string; subtotal: string }[];
  moneda: Moneda;
  total: Importe;
}

export interface CorteVentasTotales {
  dia: string;
  esHoy: boolean;
  totales: {
    registros: number;
    unidades: string;
    /** La plata que entró de verdad en cada moneda. No son equivalentes. */
    cobrado: Record<Moneda, string>;
    /** El mismo dinero visto en cada moneda, para tener un total único. */
    porMoneda: Record<Moneda, string>;
  };
  porProducto: {
    nombre: string;
    unidad: string;
    cantidad: string;
    registros: number;
    cobrado: Record<Moneda, string>;
    totalPorMoneda: Record<Moneda, string>;
  }[];
  ventas: VentaTotalRegistrada[];
}

/** Resultado de guardar varias ventas totales de una vez. */
export interface ResultadoLote {
  guardadas: { indice: number; id: string; numero: string }[];
  fallidas: { indice: number; codigo: string; mensaje: string }[];
}

/** Deuda que no viene de una venta: préstamo o cargo manual. */
export interface Cargo {
  id: string;
  _id: string;
  numero: string;
  personaNombre: string;
  tipo: 'PRESTAMO' | 'DEUDA' | 'AJUSTE';
  concepto: string;
  importe: Importe;
  moneda: Moneda;
  saldo: string;
  salioDeCaja: boolean;
  fecha: string;
  nota: string | null;
  estado: 'ACTIVO' | 'ANULADO';
}

/** Bolsa de dinero por moneda, sin convertir nada. */
export type PorMoneda = Record<Moneda, string>;

/** El informe del módulo TODO: el día entero, moneda por moneda. */
/** Una venta detrás de un producto: quién se lo llevó y qué quedó a deber. */
export interface VentaDeProducto {
  id: string;
  numero: string;
  hora: string;
  persona: string;
  deMostrador: boolean;
  cantidad: string;
  precio: string;
  subtotal: string;
  moneda: Moneda;
  aDeber: string;
}

export interface InformeTodo {
  dia: string;
  esHoy: boolean;
  /** La tasa con la que se lee este día. Si está fijada, ya no cambia. */
  tasa: TasaDelDia | null;
  tasaFijada: boolean;
  vieneDeAntes: {
    dia: string | null;
    sobrante: PorMoneda;
    observacion: string | null;
    /** Lo acumulado desde el último conteo a mano. */
    desdeElConteo?: PorMoneda;
    sinAncla?: boolean;
  };
  ventas: {
    registros: number;
    vendido: PorMoneda;
    contado: PorMoneda;
    fiado: PorMoneda;
    porProducto: {
      nombre: string;
      unidad: string;
      cantidad: string;
      registros: number;
      vendido: PorMoneda;
      fiado: PorMoneda;
      ventas: VentaDeProducto[];
    }[];
  };
  movimientos: {
    ventas: {
      id: string;
      numero: string;
      hora: string;
      persona: string;
      deMostrador: boolean;
      productos: { nombre: string; unidad: string; cantidad: string; precio: string }[];
      moneda: Moneda;
      total: string;
      cobrado: string;
      aDeber: string;
    }[];
    abonos: {
      id: string;
      numero: string;
      hora: string;
      persona: string;
      monto: string;
      moneda: Moneda;
      metodo: string;
    }[];
  };
  entradas: { contado: PorMoneda; cobrado: PorMoneda; recogido: PorMoneda };
  salidas: {
    gastado: PorMoneda;
    aProveedores: PorMoneda;
    prestado: PorMoneda;
    total: PorMoneda;
    gastos: {
      id: string;
      numero: string;
      hora: string;
      categoria: string;
      descripcion: string;
      observacion: string;
      monto: string;
      moneda: Moneda;
      /** Lo que costó en cada moneda, con la tasa del día en que se anotó. */
      eq: PorMoneda;
    }[];
    pagos: { id: string; numero: string; hora: string; persona: string; monto: string; moneda: Moneda }[];
    prestamos: {
      id: string;
      numero: string;
      hora: string;
      persona: string;
      concepto: string;
      monto: string;
      moneda: Moneda;
    }[];
  };
  queda: PorMoneda;
  deberiaQuedar: PorMoneda;
  cierre: { observacion: string; sobrante: PorMoneda; diferencia: PorMoneda } | null;
}
