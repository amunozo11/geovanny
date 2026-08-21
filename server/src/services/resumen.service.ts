import { D, MONEDAS, convert, cotizaciones, money, type Moneda } from '@geovanny/shared';
import { OperacionModel } from '../models/operacion.js';
import { PersonaModel } from '../models/persona.js';
import { ProductoModel } from '../models/producto.js';
import { GastoModel } from '../models/gasto.js';
import { PagoModel } from '../models/pago.js';
import { antiguedadHoras, hayTasa, tasaVigente } from './tasas.service.js';
import { CajaModel } from '../models/caja.js';
import { diaDeHoy, inicioDelDia, inicioDelMes } from '../lib/dias.js';

/**
 * Resumen del inicio, en la moneda que el usuario tenga seleccionada.
 *
 * Hay dos formas distintas de llegar a una cifra, y NO se mezclan:
 *
 * 1. **Lo que ya pasó** (ventas, compras, gastos) se suma usando el equivalente
 *    congelado el día de cada operación. Una venta de la semana pasada vale lo
 *    que valía entonces, aunque hoy la tasa sea otra.
 * 2. **Lo que está vivo** (deudas por cobrar, deudas por pagar, inventario) se
 *    convierte con la tasa de HOY, porque es lo que valen hoy.
 *
 * La pantalla lo dice explícitamente para que nadie tenga que adivinarlo.
 */

// El día y el mes son los del negocio, no los del servidor: una venta de las
// 8 p. m. en Colombia ocurre a la 1 a. m. UTC del día siguiente, y contarla en
// el día equivocado descuadraría el cierre.

/** Suma el equivalente congelado de un conjunto de operaciones. */
async function sumarOperaciones(
  filtro: Record<string, unknown>,
  moneda: Moneda,
  campo = 'total',
): Promise<string> {
  const [resultado] = await OperacionModel.aggregate<{ total: unknown }>([
    { $match: filtro },
    { $group: { _id: null, total: { $sum: { $toDecimal: `$${campo}.eq.${moneda}` } } } },
  ]);
  return resultado ? String(resultado.total) : '0';
}

export async function resumen(moneda: Moneda) {
  if (!(await hayTasa())) {
    return { sinTasa: true as const };
  }

  const tasa = await tasaVigente();
  const quotes = cotizaciones(tasa);
  const hoy = inicioDelDia(diaDeHoy());
  const mes = inicioDelMes();

  /** Convierte a la moneda de visualización con la tasa de HOY. */
  const aMonedaHoy = (monto: string, desde: Moneda): string =>
    convert(money(monto, desde), moneda, quotes).amount;

  // ── Lo que está vivo: deudas y existencias, a tasa de hoy ────────────────
  const [clientes, proveedores, productos, cajasActivas] = await Promise.all([
    PersonaModel.find({ tipo: 'CLIENTE', activo: true }),
    PersonaModel.find({ tipo: { $in: ['PROVEEDOR', 'TRANSPORTE'] }, activo: true }),
    ProductoModel.find({ activo: true }),
    CajaModel.find({ activa: true }).sort({ orden: 1 }),
  ]);

  /**
   * Suma los saldos de un grupo de personas: el detalle por moneda —que es como
   * él lo lleva, cuentas separadas (CN-2)— y el consolidado a tasa de hoy.
   */
  const acumularSaldos = (personas: typeof clientes) => {
    const porMoneda: Record<string, string> = {};
    let total = D(0);

    for (const m of MONEDAS) {
      const suma = personas.reduce((acc, p) => acc.plus(D(p.saldos[m] ?? '0')), D(0));
      porMoneda[m] = suma.toString();
      total = total.plus(D(aMonedaHoy(suma.toString(), m)));
    }

    return { porMoneda, total: total.toString() };
  };

  const meDeben = acumularSaldos(clientes);
  const debo = acumularSaldos(proveedores);

  const inventario = productos.reduce(
    (acc, p) => acc.plus(D(p.stock).times(D(p.costoPromedio))),
    D(0),
  );
  const stockBajo = productos.filter(
    (p) => D(p.stockMinimo).greaterThan(0) && D(p.stock).lessThanOrEqualTo(D(p.stockMinimo)),
  );

  // ── Lo que ya pasó: a la tasa de su día ─────────────────────────────────
  const [ventasHoy, ventasMes, comprasMes, cobradoHoy] = await Promise.all([
    sumarOperaciones({ tipo: 'VENTA', estado: 'ACTIVA', fecha: { $gte: hoy } }, moneda),
    sumarOperaciones({ tipo: 'VENTA', estado: 'ACTIVA', fecha: { $gte: mes } }, moneda),
    sumarOperaciones({ tipo: 'COMPRA', estado: 'ACTIVA', fecha: { $gte: mes } }, moneda),
    PagoModel.aggregate<{ total: unknown }>([
      { $match: { direccion: 'ENTRA', estado: 'ACTIVO', fecha: { $gte: hoy } } },
      { $group: { _id: null, total: { $sum: { $toDecimal: `$importe.eq.${moneda}` } } } },
    ]).then(([r]) => (r ? String(r.total) : '0')),
  ]);

  const [gastosMes] = await GastoModel.aggregate<{ total: unknown }>([
    { $match: { estado: 'ACTIVO', fecha: { $gte: mes } } },
    { $group: { _id: null, total: { $sum: { $toDecimal: `$importe.eq.${moneda}` } } } },
  ]);

  const [utilidadMes] = await OperacionModel.aggregate<{ total: unknown }>([
    { $match: { tipo: 'VENTA', estado: 'ACTIVA', fecha: { $gte: mes } } },
    { $group: { _id: null, total: { $sum: { $toDecimal: '$utilidad' } } } },
  ]);

  const utilidadBrutaCop = utilidadMes ? String(utilidadMes.total) : '0';
  const gastosDelMes = gastosMes ? String(gastosMes.total) : '0';

  const [ultimasVentas, cantidadVentasHoy] = await Promise.all([
    OperacionModel.find({ tipo: 'VENTA', estado: 'ACTIVA' }).sort({ fecha: -1 }).limit(5),
    OperacionModel.countDocuments({ tipo: 'VENTA', estado: 'ACTIVA', fecha: { $gte: hoy } }),
  ]);

  const deudoresTop = clientes
    .map((c) => ({
      id: c._id.toString(),
      nombre: c.nombre,
      telefono: c.telefono,
      saldos: c.saldos,
      total: MONEDAS.reduce(
        (acc, m) => acc.plus(D(aMonedaHoy(c.saldos[m] ?? '0', m))),
        D(0),
      ).toString(),
    }))
    .filter((c) => D(c.total).greaterThan(0))
    .sort((a, b) => D(b.total).comparedTo(D(a.total)))
    .slice(0, 5);

  // "¿Cuánto dinero tengo?" — la cuarta pregunta del día, junto a cuánto debo,
  // cuánto me deben y qué tengo en el almacén.
  const dinero = {
    cajas: cajasActivas.map((caja) => ({
      id: caja._id.toString(),
      nombre: caja.nombre,
      moneda: caja.moneda,
      tipo: caja.tipo,
      saldo: caja.saldo,
      convertido: aMonedaHoy(caja.saldo, caja.moneda),
    })),
    total: cajasActivas
      .reduce((acc, caja) => acc.plus(D(aMonedaHoy(caja.saldo, caja.moneda))), D(0))
      .toString(),
  };

  return {
    sinTasa: false as const,
    moneda,
    tasa,
    dinero,
    tasaAntiguedadHoras: await antiguedadHoras(),

    meDeben,
    debo,
    diferencia: D(meDeben.total).minus(D(debo.total)).toString(),

    ventasHoy,
    cantidadVentasHoy,
    cobradoHoy,
    ventasMes,
    comprasMes,
    gastosMes: gastosDelMes,
    utilidadMes: {
      bruta: aMonedaHoy(utilidadBrutaCop, 'COP'),
      gastos: gastosDelMes,
      neta: D(aMonedaHoy(utilidadBrutaCop, 'COP')).minus(D(gastosDelMes)).toString(),
    },

    inventario: {
      valor: aMonedaHoy(inventario.toString(), 'COP'),
      productos: productos.length,
      stockBajo: stockBajo.map((p) => ({
        id: p._id.toString(),
        nombre: p.nombre,
        stock: p.stock,
        unidad: p.unidad,
      })),
    },

    deudoresTop,
    ultimasVentas: ultimasVentas.map((v) => ({
      id: v._id.toString(),
      numero: v.numero,
      persona: v.personaNombre,
      fecha: v.fecha,
      formaPago: v.formaPago,
      saldo: v.saldo,
      moneda: v.moneda,
      total: v.total,
    })),
  };
}
