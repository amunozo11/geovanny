import { D, MONEDAS, type Moneda } from '@geovanny/shared';
import { OperacionModel } from '../models/operacion.js';
import { PagoModel } from '../models/pago.js';
import { GastoModel } from '../models/gasto.js';
import { CargoModel } from '../models/cargo.js';
import { CierreModel, sobranteVacio } from '../models/cierre.js';
import { ZONA, diaDeHoy, rangoDelDia } from '../lib/dias.js';

/**
 * TODO: el día entero, moneda por moneda.
 *
 * Es el cierre que hoy hace en la última página del cuaderno: qué salió, qué
 * entró, qué se gastó en el camino y cuánto tendría que quedar en el cajón.
 *
 * La regla que manda aquí es que **nada se convierte**. En las otras pantallas
 * se enseña todo llevado a una sola moneda, que sirve para comparar; para
 * cerrar la caja no sirve de nada, porque los bolívares y los dólares están en
 * bolsillos distintos y se cuentan por separado. Cada cifra de este informe está
 * en la moneda en que de verdad se pactó o se pagó.
 */

const enCero = (): Record<Moneda, string> =>
  Object.fromEntries(MONEDAS.map((m) => [m, '0'])) as Record<Moneda, string>;

const sumarEn = (
  acumulado: Record<Moneda, string>,
  moneda: Moneda,
  monto: string,
): Record<Moneda, string> => {
  acumulado[moneda] = D(acumulado[moneda]).plus(D(monto)).toString();
  return acumulado;
};

/** Resta dos bolsas de dinero, moneda por moneda. */
const restar = (
  a: Record<Moneda, string>,
  ...otras: Record<Moneda, string>[]
): Record<Moneda, string> => {
  const resultado = enCero();
  for (const m of MONEDAS) {
    resultado[m] = otras
      .reduce((acc, otra) => acc.minus(D(otra[m])), D(a[m]))
      .toString();
  }
  return resultado;
};

const sumar = (...bolsas: Record<Moneda, string>[]): Record<Moneda, string> => {
  const resultado = enCero();
  for (const m of MONEDAS) {
    resultado[m] = bolsas.reduce((acc, bolsa) => acc.plus(D(bolsa[m])), D(0)).toString();
  }
  return resultado;
};

const hora = (fecha: Date): string =>
  new Intl.DateTimeFormat('es-CO', {
    timeZone: ZONA,
    hour: '2-digit',
    minute: '2-digit',
  }).format(fecha);

/**
 * Con cuánto se arranca el día: lo que quedó contado en el último cierre
 * anterior a este.
 *
 * Se busca el cierre más reciente **antes** de `dia`, no el de ayer exacto:
 * si el domingo no se abrió, el lunes tiene que arrancar con lo del sábado, no
 * con cero.
 */
async function loQueViene(dia: string) {
  const anterior = await CierreModel.findOne({ dia: { $lt: dia } }).sort({ dia: -1 });
  return {
    dia: anterior?.dia ?? null,
    sobrante: (anterior?.sobrante as Record<Moneda, string> | undefined) ?? sobranteVacio(),
    observacion: anterior?.observacion ?? null,
  };
}

export async function informeDelDia(dia: string) {
  const { desde, hasta } = rangoDelDia(dia);
  const rango = { $gte: desde, $lt: hasta };

  const [ventas, cobros, pagosProveedor, gastos, prestamos, cierre, vieneDeAntes] =
    await Promise.all([
      OperacionModel.find({ tipo: 'VENTA', estado: 'ACTIVA', fecha: rango }).sort({ fecha: 1 }),
      PagoModel.find({ direccion: 'ENTRA', estado: 'ACTIVO', fecha: rango }).sort({ fecha: 1 }),
      PagoModel.find({ direccion: 'SALE', estado: 'ACTIVO', fecha: rango }).sort({ fecha: 1 }),
      GastoModel.find({ estado: 'ACTIVO', fecha: rango }).sort({ fecha: 1 }),
      CargoModel.find({ estado: 'ACTIVO', salioDeCaja: true, fecha: rango }).sort({ fecha: 1 }),
      CierreModel.findOne({ dia }),
      loQueViene(dia),
    ]);

  // ── Lo vendido, producto por producto y moneda por moneda ────────────────
  const vendido = enCero();
  const contado = enCero();
  const fiado = enCero();

  const porProducto = new Map<
    string,
    { nombre: string; unidad: string; cantidad: string; registros: number; vendido: Record<Moneda, string> }
  >();

  for (const venta of ventas) {
    sumarEn(vendido, venta.moneda, venta.total.monto);
    // `pagadoInicial` es lo que entró EN EL ACTO. `pagado` crece con los abonos
    // posteriores, así que usarlo movería el cierre de un día ya cerrado.
    sumarEn(contado, venta.moneda, venta.pagadoInicial);
    sumarEn(fiado, venta.moneda, D(venta.total.monto).minus(D(venta.pagadoInicial)).toString());

    for (const item of venta.items) {
      const clave = item.productoId.toString();
      const fila = porProducto.get(clave) ?? {
        nombre: item.nombre,
        unidad: item.unidad,
        cantidad: '0',
        registros: 0,
        vendido: enCero(),
      };

      fila.cantidad = D(fila.cantidad).plus(D(item.cantidad)).toString();
      fila.registros += 1;
      sumarEn(fila.vendido, venta.moneda, item.subtotal);
      porProducto.set(clave, fila);
    }
  }

  // ── Lo que entró y lo que salió, en la moneda en que se movió ────────────
  const cobrado = enCero();
  for (const pago of cobros) sumarEn(cobrado, pago.importe.moneda, pago.importe.monto);

  const aProveedores = enCero();
  for (const pago of pagosProveedor) sumarEn(aProveedores, pago.importe.moneda, pago.importe.monto);

  const gastado = enCero();
  for (const gasto of gastos) sumarEn(gastado, gasto.importe.moneda, gasto.importe.monto);

  const prestado = enCero();
  for (const cargo of prestamos) sumarEn(prestado, cargo.moneda, cargo.importe.monto);

  const recogido = sumar(contado, cobrado);
  const salidas = sumar(gastado, aProveedores, prestado);
  const queda = restar(recogido, salidas);
  const deberiaQuedar = sumar(vieneDeAntes.sobrante, queda);

  const contadoAlCerrar = (cierre?.sobrante as Record<Moneda, string> | undefined) ?? null;

  return {
    dia,
    esHoy: dia === diaDeHoy(),

    vieneDeAntes,

    ventas: {
      registros: ventas.length,
      vendido,
      contado,
      fiado,
      porProducto: [...porProducto.values()].sort((a, b) => a.nombre.localeCompare(b.nombre)),
    },

    entradas: { contado, cobrado, recogido },

    salidas: {
      gastado,
      aProveedores,
      prestado,
      total: salidas,
      /** Los gastos uno por uno: es la lista que se va escribiendo aquí mismo. */
      gastos: gastos.map((g) => ({
        id: g._id.toString(),
        numero: g.numero,
        hora: hora(g.fecha),
        categoria: g.categoria,
        descripcion: g.descripcion,
        monto: g.importe.monto,
        moneda: g.importe.moneda,
      })),
      pagos: pagosProveedor.map((p) => ({
        id: p._id.toString(),
        numero: p.numero,
        hora: hora(p.fecha),
        persona: p.personaNombre,
        monto: p.importe.monto,
        moneda: p.importe.moneda,
      })),
      prestamos: prestamos.map((c) => ({
        id: c._id.toString(),
        numero: c.numero,
        hora: hora(c.fecha),
        persona: c.personaNombre,
        concepto: c.concepto,
        monto: c.importe.monto,
        moneda: c.moneda,
      })),
    },

    /** Recogido menos lo que salió, sin contar lo que traía de antes. */
    queda,
    /** Lo que tendría que haber en el cajón, contando lo que venía de antes. */
    deberiaQuedar,

    cierre: cierre
      ? {
          observacion: cierre.observacion,
          sobrante: contadoAlCerrar!,
          diferencia: restar(contadoAlCerrar!, deberiaQuedar),
        }
      : null,
  };
}

/**
 * Guarda el cierre del día: lo que se contó y la observación.
 *
 * No se valida contra lo calculado a propósito. Si contó 20 mil menos, eso es un
 * dato, no un error que haya que impedir: se guarda tal cual y la pantalla
 * enseña la diferencia para que se pueda buscar de dónde salió.
 */
export async function guardarCierre(entrada: {
  dia: string;
  sobrante: Partial<Record<Moneda, string>>;
  observacion?: string;
  cerradoPor?: string | null;
}) {
  const sobrante = sobranteVacio();
  for (const m of MONEDAS) {
    sobrante[m] = D(entrada.sobrante[m] ?? '0').toString();
  }

  await CierreModel.updateOne(
    { dia: entrada.dia },
    {
      $set: {
        sobrante,
        observacion: entrada.observacion?.trim() ?? '',
        cerradoPor: entrada.cerradoPor ?? null,
      },
    },
    { upsert: true },
  );

  return informeDelDia(entrada.dia);
}
