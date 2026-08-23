import { D, MONEDAS, type Moneda } from '@geovanny/shared';
import { OperacionModel } from '../models/operacion.js';
import { ZONA, diaDeHoy, rangoDelDia } from '../lib/dias.js';
import { crearOperacion } from './operaciones.service.js';

/**
 * Ventas totales: lo que se despacha y se cobra en el mostrador.
 *
 * Es una venta como cualquier otra —descuenta inventario, entra en caja y suma
 * en el cierre del día— pero sin cliente detrás: nadie queda debiendo, así que
 * abrir una ficha de persona para cada una sería trabajo inútil. Se distinguen
 * por el canal `DIRECTA` y viven en su propio apartado porque se registran de
 * otra manera: una tras otra, producto por producto, sin salir de la pantalla.
 */

export interface LineaVentaTotal {
  productoId: string;
  cantidad: string;
  precio: string;
  moneda: Moneda;
  cajaId?: string | null;
  nota?: string | null;
  fecha?: string;
  /** Registrar aunque no haya existencias, como en la venta normal (RP-14). */
  forzar?: boolean;
}

/** Registra una venta total. Cada línea es su propia venta, con su número. */
export async function registrar(linea: LineaVentaTotal, creadoPor?: string | null) {
  return crearOperacion({
    tipo: 'VENTA',
    canal: 'DIRECTA',
    personaId: null,
    moneda: linea.moneda,
    items: [{ productoId: linea.productoId, cantidad: linea.cantidad, precio: linea.precio }],
    formaPago: 'CONTADO',
    cajaId: linea.cajaId ?? null,
    fecha: linea.fecha,
    nota: linea.nota ?? null,
    creadoPor,
    // Igual que en la venta normal: si no hay existencias se avisa, y solo se
    // registra en negativo cuando quien vende lo confirma (RP-14).
    permitirStockNegativo: linea.forzar === true,
  });
}

export interface ResultadoLote {
  guardadas: { indice: number; id: string; numero: string }[];
  fallidas: { indice: number; codigo: string; mensaje: string }[];
}

/**
 * Guarda varias de una vez.
 *
 * Cada línea se guarda por separado, con su propia transacción: si la tercera
 * falla porque no hay existencias, las dos primeras siguen guardadas y la
 * respuesta dice exactamente cuál falló y por qué. Deshacerlas todas obligaría
 * a volver a teclearlas, que es justo lo que este módulo viene a evitar.
 */
export async function registrarLote(
  lineas: LineaVentaTotal[],
  creadoPor?: string | null,
): Promise<ResultadoLote> {
  const resultado: ResultadoLote = { guardadas: [], fallidas: [] };

  for (const [indice, linea] of lineas.entries()) {
    try {
      const venta = await registrar(linea, creadoPor);
      resultado.guardadas.push({
        indice,
        id: venta._id.toString(),
        numero: venta.numero,
      });
    } catch (error) {
      const conCodigo = error as { code?: string; message?: string };
      resultado.fallidas.push({
        indice,
        codigo: conCodigo.code ?? 'ERROR',
        mensaje: conCodigo.message ?? 'No se pudo guardar.',
      });
    }
  }

  return resultado;
}

const hora = (fecha: Date): string =>
  new Intl.DateTimeFormat('es-CO', {
    timeZone: ZONA,
    hour: '2-digit',
    minute: '2-digit',
  }).format(fecha);

/**
 * Lo vendido de mostrador en un día, con el corte que él pide: cuántas
 * unidades salieron y cuánto es eso en cada moneda.
 *
 * Los totales usan el equivalente congelado de cada venta, así que el corte de
 * un día pasado no se mueve aunque hoy la tasa sea otra (RC-03).
 */
export async function delDia(dia: string) {
  const { desde, hasta } = rangoDelDia(dia);

  const ventas = await OperacionModel.find({
    tipo: 'VENTA',
    canal: 'DIRECTA',
    estado: 'ACTIVA',
    fecha: { $gte: desde, $lt: hasta },
  }).sort({ fecha: -1 });

  const totalPorMoneda = Object.fromEntries(
    MONEDAS.map((m) => [
      m,
      ventas.reduce((acc, v) => acc.plus(D(v.total.eq[m])), D(0)).toString(),
    ]),
  ) as Record<Moneda, string>;

  // Cuántas unidades salieron, agrupadas por producto: sumar bultos con cajas
  // daría un número que no significa nada, así que el desglose va por producto
  // y el gran total solo cuenta cuántos registros hubo.
  const porProducto = new Map<
    string,
    { nombre: string; unidad: string; cantidad: string; totalPorMoneda: Record<Moneda, string> }
  >();

  for (const venta of ventas) {
    for (const item of venta.items) {
      const clave = item.productoId.toString();
      const previo = porProducto.get(clave);
      const acumulado = previo ?? {
        nombre: item.nombre,
        unidad: item.unidad,
        cantidad: '0',
        totalPorMoneda: Object.fromEntries(MONEDAS.map((m) => [m, '0'])) as Record<Moneda, string>,
      };

      acumulado.cantidad = D(acumulado.cantidad).plus(D(item.cantidad)).toString();

      // El equivalente de la línea, en proporción a lo que pesa en su venta.
      // Con una sola línea por venta —que es lo normal aquí— es el total.
      const proporcion = D(venta.total.monto).isZero()
        ? D(0)
        : D(item.subtotal).dividedBy(D(venta.total.monto));

      for (const m of MONEDAS) {
        acumulado.totalPorMoneda[m] = D(acumulado.totalPorMoneda[m])
          .plus(D(venta.total.eq[m]).times(proporcion))
          .toDecimalPlaces(m === 'COP' ? 0 : 2)
          .toString();
      }

      porProducto.set(clave, acumulado);
    }
  }

  return {
    dia,
    esHoy: dia === diaDeHoy(),
    totales: {
      registros: ventas.length,
      unidades: ventas
        .reduce((acc, v) => acc.plus(v.items.reduce((s, i) => s.plus(D(i.cantidad)), D(0))), D(0))
        .toString(),
      porMoneda: totalPorMoneda,
    },
    porProducto: [...porProducto.values()].sort((a, b) => a.nombre.localeCompare(b.nombre)),
    ventas: ventas.map((v) => ({
      id: v._id.toString(),
      numero: v.numero,
      hora: hora(v.fecha),
      fecha: v.fecha,
      nota: v.nota,
      items: v.items.map((i) => ({
        nombre: i.nombre,
        unidad: i.unidad,
        cantidad: i.cantidad,
        precio: i.precio,
        subtotal: i.subtotal,
      })),
      moneda: v.moneda,
      total: v.total,
    })),
  };
}
