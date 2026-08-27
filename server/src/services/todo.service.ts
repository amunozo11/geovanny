import { D, MONEDAS, type Moneda, type TasaDelDia } from '@geovanny/shared';
import { OperacionModel } from '../models/operacion.js';
import { PagoModel } from '../models/pago.js';
import { GastoModel } from '../models/gasto.js';
import { CargoModel } from '../models/cargo.js';
import { CierreModel, sobranteVacio } from '../models/cierre.js';
import { ZONA, diaDeHoy, rangoDelDia } from '../lib/dias.js';
import { tasaVigente } from './tasas.service.js';

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
 * Con cuánto se arranca el día. **Se arrastra solo.**
 *
 * Antes esto valía lo que dijera el último cierre escrito a mano, y cero si no
 * había ninguno. Eso obligaba a cerrar todos los días sin saltarse ninguno: si
 * el martes no se escribía el conteo, el miércoles arrancaba en cero y el
 * "debería quedar" salía mal — justo el número por el que se abre la pantalla.
 *
 * Ahora se calcula: se toma el último conteo a mano como punto de partida y se
 * le suma **todo lo que se movió desde entonces** hasta la víspera de `dia`. El
 * conteo a mano deja de ser una obligación diaria y pasa a ser lo que de verdad
 * es: un ancla. Cuando se escribe, corrige la deriva; cuando no, el sistema
 * sigue la cuenta solo.
 */
async function loQueViene(dia: string) {
  const ancla = await CierreModel.findOne({ dia: { $lt: dia } }).sort({ dia: -1 });
  const base = (ancla?.sobrante as Record<Moneda, string> | undefined) ?? sobranteVacio();

  // Todo lo movido entre el ancla (sin incluirla) y la víspera de `dia`.
  const desde = ancla ? rangoDelDia(ancla.dia).hasta : new Date(0);
  const hasta = rangoDelDia(dia).desde;
  if (hasta <= desde) {
    return { dia: ancla?.dia ?? null, sobrante: base, observacion: ancla?.observacion ?? null };
  }

  const movido = await loQueSeMovio(desde, hasta);

  return {
    dia: ancla?.dia ?? null,
    sobrante: sumar(base, movido),
    observacion: ancla?.observacion ?? null,
    /** Lo acumulado desde el último conteo: separado, para poder explicarlo. */
    desdeElConteo: movido,
    /** `true` si nadie ha contado nunca: la cuenta viene de cero. */
    sinAncla: !ancla,
  };
}

/**
 * El neto de caja en un rango: lo que entró menos lo que salió, por moneda.
 *
 * Es el mismo cálculo que hace el informe de un día, aplicado a varios: sirve
 * para arrastrar el saldo sin obligar a cerrar cada jornada.
 */
async function loQueSeMovio(desde: Date, hasta: Date): Promise<Record<Moneda, string>> {
  const rango = { $gte: desde, $lt: hasta };

  const [ventas, cobros, gastos, prestamos] = await Promise.all([
    OperacionModel.find({ tipo: 'VENTA', estado: 'ACTIVA', fecha: rango }, { moneda: 1, pagadoInicial: 1 }),
    PagoModel.find({ direccion: 'ENTRA', estado: 'ACTIVO', fecha: rango }, { importe: 1 }),
    GastoModel.find({ estado: 'ACTIVO', fecha: rango }, { importe: 1 }),
    CargoModel.find({ estado: 'ACTIVO', salioDeCaja: true, fecha: rango }, { moneda: 1, importe: 1 }),
  ]);

  const entra = enCero();
  for (const v of ventas) sumarEn(entra, v.moneda, v.pagadoInicial);
  for (const p of cobros) sumarEn(entra, p.importe.moneda, p.importe.monto);

  // Los pagos a proveedores quedan fuera, igual que en el día: si se restaran
  // aquí, el saldo arrastrado no cuadraría con el que enseña la pantalla.
  const sale = enCero();
  for (const g of gastos) sumarEn(sale, g.importe.moneda, g.importe.monto);
  for (const c of prestamos) sumarEn(sale, c.moneda, c.importe.monto);

  return restar(entra, sale);
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

  /**
   * Cada producto trae detrás la lista de quién se lo llevó.
   *
   * El total dice "salieron 61 bultos"; lo que hace falta para trabajar es
   * saber que 12 se los llevó Memín fiados y 8 se pagaron en el mostrador. Sin
   * los nombres, un número grande no se puede perseguir.
   */
  const porProducto = new Map<
    string,
    {
      nombre: string;
      unidad: string;
      cantidad: string;
      registros: number;
      vendido: Record<Moneda, string>;
      /** Cuánto de ese producto quedó a deber. */
      fiado: Record<Moneda, string>;
      ventas: {
        id: string;
        numero: string;
        hora: string;
        persona: string;
        deMostrador: boolean;
        cantidad: string;
        precio: string;
        subtotal: string;
        moneda: Moneda;
        /** Lo que de esta línea quedó a deber. */
        aDeber: string;
      }[];
    }
  >();

  for (const venta of ventas) {
    sumarEn(vendido, venta.moneda, venta.total.monto);
    // `pagadoInicial` es lo que entró EN EL ACTO. `pagado` crece con los abonos
    // posteriores, así que usarlo movería el cierre de un día ya cerrado.
    sumarEn(contado, venta.moneda, venta.pagadoInicial);
    sumarEn(fiado, venta.moneda, D(venta.total.monto).minus(D(venta.pagadoInicial)).toString());

    // Qué parte de la venta quedó a deber, para repartirla entre sus líneas.
    const total = D(venta.total.monto);
    const proporcionFiada = total.isZero()
      ? D(0)
      : total.minus(D(venta.pagadoInicial)).dividedBy(total);

    for (const item of venta.items) {
      const clave = item.productoId.toString();
      const fila = porProducto.get(clave) ?? {
        nombre: item.nombre,
        unidad: item.unidad,
        cantidad: '0',
        registros: 0,
        vendido: enCero(),
        fiado: enCero(),
        ventas: [],
      };

      const aDeber = D(item.subtotal)
        .times(proporcionFiada)
        .toDecimalPlaces(venta.moneda === 'COP' ? 0 : 2)
        .toString();

      fila.cantidad = D(fila.cantidad).plus(D(item.cantidad)).toString();
      fila.registros += 1;
      sumarEn(fila.vendido, venta.moneda, item.subtotal);
      sumarEn(fila.fiado, venta.moneda, aDeber);
      fila.ventas.push({
        id: venta._id.toString(),
        numero: venta.numero,
        hora: hora(venta.fecha),
        persona: venta.personaNombre,
        deMostrador: venta.canal === 'DIRECTA',
        cantidad: item.cantidad,
        precio: item.precio,
        subtotal: item.subtotal,
        moneda: venta.moneda,
        aDeber,
      });

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
  /**
   * Lo que sale de la cuenta del día. **Los pagos a proveedores NO entran.**
   *
   * Es una decisión del negocio, no un descuido: lo que se le paga a un
   * proveedor no es parte de lo que se hizo vendiendo, y meterlo aquí tapaba el
   * número que esta pantalla existe para responder. Se siguen registrando, se
   * siguen viendo aparte, y siguen saliendo de su caja — pero no se restan de
   * este total.
   */
  const salidas = sumar(gastado, prestado);
  const queda = restar(recogido, salidas);
  const deberiaQuedar = sumar(vieneDeAntes.sobrante, queda);

  const contadoAlCerrar = (cierre?.sobrante as Record<Moneda, string> | undefined) ?? null;

  /**
   * La tasa con la que se lee este día, y **no cambia**.
   *
   * Si el día ya se cerró, es la que se guardó al cerrarlo. Si no, la vigente.
   * Ese matiz es todo el asunto: un reporte de ayer tiene que dar los mismos
   * números hoy, mañana y siempre, aunque el dólar se haya movido tres veces
   * desde entonces. Las cifras de cada operación ya vienen congeladas una a una
   * (RC-03); esto fija además la referencia con la que se leen los totales.
   */
  const tasaDelDia =
    (cierre?.tasa as TasaDelDia | undefined) ??
    // Si no hay tasa registrada todavía, no se inventa ninguna (RC-05).
    (await tasaVigente().catch(() => null));

  return {
    dia,
    esHoy: dia === diaDeHoy(),
    tasa: tasaDelDia,
    /** `true` cuando la tasa quedó fijada al cerrar el día y ya no se moverá. */
    tasaFijada: Boolean(cierre?.tasa),

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
      /** Se informa, pero **no** se resta del total (ver `salidas.total`). */
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
        observacion: g.observacion ?? '',
        monto: g.importe.monto,
        moneda: g.importe.moneda,
        /**
         * Lo que costó en las otras monedas, con la tasa **del día en que se
         * anotó**. Sale del equivalente congelado del propio gasto, no de una
         * conversión hecha ahora: un gasto de la semana pasada tiene que seguir
         * valiendo lo que valía entonces por mucho que hoy el dólar esté a otro
         * precio (RC-03).
         */
        eq: g.importe.eq,
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

    /**
     * Todo lo que pasó ese día, en orden y con nombre. Los totales dicen
     * cuánto; esto dice con quién, que es lo que hace falta para reclamar.
     */
    movimientos: {
      ventas: ventas.map((v) => ({
        id: v._id.toString(),
        numero: v.numero,
        hora: hora(v.fecha),
        persona: v.personaNombre,
        deMostrador: v.canal === 'DIRECTA',
        productos: v.items.map((i) => ({
          nombre: i.nombre,
          unidad: i.unidad,
          cantidad: i.cantidad,
          precio: i.precio,
        })),
        moneda: v.moneda,
        total: v.total.monto,
        cobrado: v.pagadoInicial,
        aDeber: D(v.total.monto).minus(D(v.pagadoInicial)).toString(),
      })),
      abonos: cobros.map((p) => ({
        id: p._id.toString(),
        numero: p.numero,
        hora: hora(p.fecha),
        persona: p.personaNombre,
        monto: p.importe.monto,
        moneda: p.importe.moneda,
        metodo: p.metodo,
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

  // Al cerrar se clava la tasa del día. A partir de aquí ese reporte da los
  // mismos números para siempre, aunque el dólar se mueva mañana (RC-03).
  const tasa = await tasaVigente().catch(() => null);

  await CierreModel.updateOne(
    { dia: entrada.dia },
    {
      $set: {
        sobrante,
        observacion: entrada.observacion?.trim() ?? '',
        cerradoPor: entrada.cerradoPor ?? null,
        ...(tasa ? { tasa } : {}),
      },
    },
    { upsert: true },
  );

  return informeDelDia(entrada.dia);
}
