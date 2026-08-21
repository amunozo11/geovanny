import { D, type Moneda } from '@geovanny/shared';
import { OperacionModel } from '../models/operacion.js';
import { PagoModel } from '../models/pago.js';
import { GastoModel } from '../models/gasto.js';
import { MovimientoModel } from '../models/movimiento.js';
import { ZONA, diaDeHoy, rangoDelDia, ultimosDias } from '../lib/dias.js';

/**
 * El día como unidad.
 *
 * Es como está organizado su cuaderno: una columna por día de venta. Aquí cada
 * día se puede abrir y ver TODO lo que se registró —ventas, abonos, viajes,
 * gastos, mermas— en el orden en que ocurrió, con sus totales.
 *
 * Los totales de un día se calculan con el equivalente congelado de cada
 * operación, así que el cierre de un día pasado nunca cambia aunque hoy la tasa
 * sea otra.
 */

/** Suma un campo de equivalentes dentro de un rango. */
async function sumar(
  modelo: typeof OperacionModel | typeof PagoModel | typeof GastoModel,
  filtro: Record<string, unknown>,
  campo: string,
  moneda: Moneda,
): Promise<string> {
  const [resultado] = await modelo.aggregate<{ total: unknown }>([
    { $match: filtro },
    { $group: { _id: null, total: { $sum: { $toDecimal: `$${campo}.eq.${moneda}` } } } },
  ]);
  return resultado ? String(resultado.total) : '0';
}

export interface MovimientoDelDia {
  hora: string;
  tipo: 'VENTA' | 'COMPRA' | 'COBRO' | 'PAGO' | 'GASTO' | 'INVENTARIO';
  numero: string;
  titulo: string;
  detalle: string;
  /** En la moneda de visualización pedida. */
  monto: string;
  /** Lo que se pactó, en su moneda original. */
  montoOriginal: string;
  monedaOriginal: string;
  /** `true` si el dinero entró, `false` si salió, `null` si no movió plata. */
  entra: boolean | null;
}

const hora = (fecha: Date): string =>
  new Intl.DateTimeFormat('es-CO', {
    timeZone: ZONA,
    hour: '2-digit',
    minute: '2-digit',
  }).format(fecha);

/** Todo lo que se registró un día, con sus totales. */
export async function detalleDelDia(dia: string, moneda: Moneda) {
  const { desde, hasta } = rangoDelDia(dia);
  const rango = { $gte: desde, $lt: hasta };

  const [ventas, compras, cobros, pagos, gastos, ajustes] = await Promise.all([
    OperacionModel.find({ tipo: 'VENTA', estado: 'ACTIVA', fecha: rango }).sort({ fecha: 1 }),
    OperacionModel.find({ tipo: 'COMPRA', estado: 'ACTIVA', fecha: rango }).sort({ fecha: 1 }),
    PagoModel.find({ direccion: 'ENTRA', estado: 'ACTIVO', fecha: rango }).sort({ fecha: 1 }),
    PagoModel.find({ direccion: 'SALE', estado: 'ACTIVO', fecha: rango }).sort({ fecha: 1 }),
    GastoModel.find({ estado: 'ACTIVO', fecha: rango }).sort({ fecha: 1 }),
    MovimientoModel.find({ tipo: { $in: ['MERMA', 'AJUSTE', 'DEVOLUCION'] }, fecha: rango }).sort({
      fecha: 1,
    }),
  ]);

  const movimientos: MovimientoDelDia[] = [
    ...ventas.map((v) => ({
      hora: hora(v.fecha),
      tipo: 'VENTA' as const,
      numero: v.numero,
      titulo: v.personaNombre,
      detalle: `${v.items.map((i) => `${i.cantidad} ${i.nombre.toLowerCase()}`).join(' · ')}${
        v.formaPago === 'FIADO' ? ' · fiado' : v.formaPago === 'PARCIAL' ? ' · abonó algo' : ''
      }`,
      monto: v.total.eq[moneda],
      montoOriginal: v.total.monto,
      monedaOriginal: v.moneda,
      // Una venta fiada no mueve plata: no entra ni sale. Marcarla como salida
      // sería decir que el negocio pagó algo, que es justo lo contrario.
      entra: v.formaPago === 'FIADO' ? null : true,
    })),
    ...compras.map((c) => ({
      hora: hora(c.fecha),
      tipo: 'COMPRA' as const,
      numero: c.numero,
      titulo: c.personaNombre,
      detalle: c.items.map((i) => `${i.cantidad} ${i.nombre.toLowerCase()}`).join(' · '),
      monto: c.total.eq[moneda],
      montoOriginal: c.total.monto,
      monedaOriginal: c.moneda,
      entra: false,
    })),
    ...cobros.map((p) => ({
      hora: hora(p.fecha),
      tipo: 'COBRO' as const,
      numero: p.numero,
      titulo: p.personaNombre,
      detalle: `abono${p.importe.moneda !== p.aplicaA ? ` en ${p.importe.moneda} a deuda en ${p.aplicaA}` : ''}`,
      monto: p.importe.eq[moneda],
      montoOriginal: p.importe.monto,
      monedaOriginal: p.importe.moneda,
      entra: true,
    })),
    ...pagos.map((p) => ({
      hora: hora(p.fecha),
      tipo: 'PAGO' as const,
      numero: p.numero,
      titulo: p.personaNombre,
      detalle: 'abono a proveedor',
      monto: p.importe.eq[moneda],
      montoOriginal: p.importe.monto,
      monedaOriginal: p.importe.moneda,
      entra: false,
    })),
    ...gastos.map((g) => ({
      hora: hora(g.fecha),
      tipo: 'GASTO' as const,
      numero: g.numero,
      titulo: g.categoria.toLowerCase(),
      detalle: g.descripcion || '—',
      monto: g.importe.eq[moneda],
      montoOriginal: g.importe.monto,
      monedaOriginal: g.importe.moneda,
      entra: false,
    })),
    ...ajustes.map((m) => ({
      hora: hora(m.fecha),
      tipo: 'INVENTARIO' as const,
      numero: m.tipo.toLowerCase(),
      titulo: m.productoNombre,
      detalle: `${m.cantidad} · ${m.motivo ?? ''}`.trim(),
      monto: '0',
      montoOriginal: m.cantidad,
      monedaOriginal: '',
      entra: null,
    })),
  ].sort((a, b) => a.hora.localeCompare(b.hora));

  const [totalVentas, totalCompras, totalCobros, totalPagos, totalGastos] = await Promise.all([
    sumar(OperacionModel, { tipo: 'VENTA', estado: 'ACTIVA', fecha: rango }, 'total', moneda),
    sumar(OperacionModel, { tipo: 'COMPRA', estado: 'ACTIVA', fecha: rango }, 'total', moneda),
    sumar(PagoModel, { direccion: 'ENTRA', estado: 'ACTIVO', fecha: rango }, 'importe', moneda),
    sumar(PagoModel, { direccion: 'SALE', estado: 'ACTIVO', fecha: rango }, 'importe', moneda),
    sumar(GastoModel, { estado: 'ACTIVO', fecha: rango }, 'importe', moneda),
  ]);

  /**
   * Lo que de verdad entró ese día por ventas.
   *
   * Se usa `pagadoInicial`, que no cambia: si se usara `pagado`, el cierre de un
   * día pasado se movería cada vez que alguien abonara una venta vieja.
   * Se convierte en proporción al total, con la tasa congelada de la venta.
   */
  const contado = ventas.reduce((acc, v) => {
    const totalPactado = D(v.total.monto);
    if (totalPactado.isZero()) return acc;
    const proporcion = D(v.pagadoInicial).dividedBy(totalPactado);
    return acc.plus(D(v.total.eq[moneda]).times(proporcion));
  }, D(0));

  const fiado = D(totalVentas).minus(contado);

  return {
    dia,
    esHoy: dia === diaDeHoy(),
    moneda,
    totales: {
      ventas: totalVentas,
      cantidadVentas: ventas.length,
      fiado: fiado.toString(),
      contado: contado.toString(),
      cobros: totalCobros,
      compras: totalCompras,
      pagos: totalPagos,
      gastos: totalGastos,
      /** Lo que entró menos lo que salió: el movimiento de plata del día. */
      entroMenosSalio: contado
        .plus(D(totalCobros))
        .minus(D(totalPagos))
        .minus(D(totalGastos))
        .toString(),
    },
    movimientos,
  };
}

/**
 * Resumen de los últimos días, uno por línea.
 *
 * Es la vista de conjunto que su Excel tiene como columnas: de un vistazo, qué
 * se movió cada día.
 */
export async function listaDeDias(cantidad: number, moneda: Moneda) {
  const dias = ultimosDias(Math.min(cantidad, 90));
  const desde = rangoDelDia(dias[dias.length - 1]!).desde;

  const agrupar = (campo: string) => ({
    $dateToString: { format: '%Y-%m-%d', date: `$${campo}`, timezone: ZONA },
  });

  const [ventas, cobros, gastos] = await Promise.all([
    OperacionModel.aggregate<{ _id: string; total: unknown; cantidad: number; utilidad: unknown }>([
      { $match: { tipo: 'VENTA', estado: 'ACTIVA', fecha: { $gte: desde } } },
      {
        $group: {
          _id: agrupar('fecha'),
          total: { $sum: { $toDecimal: `$total.eq.${moneda}` } },
          utilidad: { $sum: { $toDecimal: '$utilidad' } },
          cantidad: { $sum: 1 },
        },
      },
    ]),
    PagoModel.aggregate<{ _id: string; total: unknown }>([
      { $match: { direccion: 'ENTRA', estado: 'ACTIVO', fecha: { $gte: desde } } },
      { $group: { _id: agrupar('fecha'), total: { $sum: { $toDecimal: `$importe.eq.${moneda}` } } } },
    ]),
    GastoModel.aggregate<{ _id: string; total: unknown }>([
      { $match: { estado: 'ACTIVO', fecha: { $gte: desde } } },
      { $group: { _id: agrupar('fecha'), total: { $sum: { $toDecimal: `$importe.eq.${moneda}` } } } },
    ]),
  ]);

  const porDia = new Map(ventas.map((v) => [v._id, v]));
  const cobrosPorDia = new Map(cobros.map((c) => [c._id, String(c.total)]));
  const gastosPorDia = new Map(gastos.map((g) => [g._id, String(g.total)]));

  return dias.map((dia) => {
    const venta = porDia.get(dia);
    return {
      dia,
      esHoy: dia === diaDeHoy(),
      ventas: venta ? String(venta.total) : '0',
      cantidadVentas: venta?.cantidad ?? 0,
      cobros: cobrosPorDia.get(dia) ?? '0',
      gastos: gastosPorDia.get(dia) ?? '0',
      /** En COP: la utilidad se mide en la moneda funcional (RP-01). */
      utilidadCop: venta ? String(venta.utilidad) : '0',
    };
  });
}
