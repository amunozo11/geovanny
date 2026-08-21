import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { clearTestMongo, startTestMongo, stopTestMongo } from '../test/mongo.js';
import { ProductoModel } from '../models/producto.js';
import { PersonaModel } from '../models/persona.js';
import { GastoModel } from '../models/gasto.js';
import { crearOperacion } from './operaciones.service.js';
import { registrarPago } from './pagos.service.js';
import { limpiarCache, registrarTasa } from './tasas.service.js';
import { detalleDelDia, listaDeDias } from './dias.service.js';
import { diaDeHoy, inicioDelDia, rangoDelDia } from '../lib/dias.js';
import { crearImporte } from '@geovanny/shared';
import { siguienteNumero } from '../models/contador.js';

async function base() {
  limpiarCache();
  const tasa = await registrarTasa({
    usdCop: '3099.309008',
    usdVes: '896.224496',
    mercado: 'PARALELO',
    fuente: 'MANUAL',
  });
  const papa = await ProductoModel.create({ nombre: 'PAPA', unidad: 'BULTO', stock: '500' });
  const cliente = await PersonaModel.create({ nombre: 'MEMIN', tipo: 'CLIENTE' });
  return { tasa, papa, cliente };
}

describe('El día del negocio', () => {
  it('una venta de las 8 de la noche en Colombia pertenece a ESE día', () => {
    // 21/08/2026 a la 01:00 UTC = 20/08/2026 a las 8 p. m. en Colombia
    const instante = new Date('2026-08-21T01:00:00.000Z');
    expect(diaDeHoy(instante)).toBe('2026-08-20');
  });

  it('el día empieza a medianoche de Colombia, no de UTC', () => {
    // Medianoche del 20 en Colombia = 05:00 UTC del 20
    expect(inicioDelDia('2026-08-20').toISOString()).toBe('2026-08-20T05:00:00.000Z');
  });

  it('el rango de un día cubre 24 horas exactas', () => {
    const { desde, hasta } = rangoDelDia('2026-08-20');
    expect(hasta.getTime() - desde.getTime()).toBe(24 * 3_600_000);
  });
});

describe('Ver lo registrado por días', () => {
  beforeAll(async () => {
    await startTestMongo();
  }, 120_000);

  afterAll(async () => {
    await stopTestMongo();
  });

  beforeEach(async () => {
    await clearTestMongo();
    limpiarCache();
  });

  it('reúne todo lo del día en orden, con sus totales', async () => {
    const { papa, cliente } = await base();

    await crearOperacion({
      tipo: 'VENTA',
      personaId: cliente._id.toString(),
      moneda: 'VES',
      items: [{ productoId: papa._id.toString(), cantidad: '10', precio: '1000' }],
      formaPago: 'CONTADO',
    });
    await crearOperacion({
      tipo: 'VENTA',
      personaId: cliente._id.toString(),
      moneda: 'VES',
      items: [{ productoId: papa._id.toString(), cantidad: '5', precio: '1000' }],
      formaPago: 'FIADO',
    });
    await registrarPago({
      personaId: cliente._id.toString(),
      direccion: 'ENTRA',
      monto: '2000',
      moneda: 'VES',
    });

    const dia = await detalleDelDia(diaDeHoy(), 'VES');

    expect(dia.esHoy).toBe(true);
    expect(dia.totales.cantidadVentas).toBe(2);
    expect(dia.totales.ventas).toBe('15000');
    expect(dia.totales.contado).toBe('10000');
    expect(dia.totales.fiado).toBe('5000');
    expect(dia.totales.cobros).toBe('2000');

    // Entró: 10.000 de contado + 2.000 de abono
    expect(dia.totales.entroMenosSalio).toBe('12000');
    expect(dia.movimientos).toHaveLength(3);
    expect(dia.movimientos.map((m) => m.tipo).sort()).toEqual(['COBRO', 'VENTA', 'VENTA']);
  });

  it('descuenta del día lo que salió: gastos y pagos a proveedores', async () => {
    const { papa, cliente, tasa } = await base();
    await crearOperacion({
      tipo: 'VENTA',
      personaId: cliente._id.toString(),
      moneda: 'VES',
      items: [{ productoId: papa._id.toString(), cantidad: '10', precio: '1000' }],
      formaPago: 'CONTADO',
    });

    await GastoModel.create({
      numero: await siguienteNumero('G'),
      categoria: 'COMBUSTIBLE',
      tipo: 'VARIABLE',
      descripcion: 'Gasoil del camión',
      importe: crearImporte('3000', 'VES', tasa),
      fecha: new Date(),
    });

    const dia = await detalleDelDia(diaDeHoy(), 'VES');
    expect(dia.totales.gastos).toBe('3000');
    expect(dia.totales.entroMenosSalio).toBe('7000');
    expect(dia.movimientos.some((m) => m.tipo === 'GASTO')).toBe(true);
  });

  it('cada día muestra sus propias cifras, no las de hoy', async () => {
    const { papa, cliente } = await base();
    const anteayer = diaDeHoy(new Date(Date.now() - 2 * 24 * 3_600_000));

    await crearOperacion({
      tipo: 'VENTA',
      personaId: cliente._id.toString(),
      moneda: 'VES',
      items: [{ productoId: papa._id.toString(), cantidad: '7', precio: '1000' }],
      formaPago: 'CONTADO',
      // Se registra hoy una venta que ocurrió anteayer.
      fecha: new Date(inicioDelDia(anteayer).getTime() + 10 * 3_600_000).toISOString(),
    });

    const deAnteayer = await detalleDelDia(anteayer, 'VES');
    const deHoy = await detalleDelDia(diaDeHoy(), 'VES');

    expect(deAnteayer.totales.ventas).toBe('7000');
    expect(deHoy.totales.ventas).toBe('0');
    expect(deHoy.movimientos).toHaveLength(0);
  });

  it('el mismo día se puede mirar en cualquier moneda', async () => {
    const { papa, cliente } = await base();
    await crearOperacion({
      tipo: 'VENTA',
      personaId: cliente._id.toString(),
      moneda: 'VES',
      items: [{ productoId: papa._id.toString(), cantidad: '10', precio: '1000' }],
      formaPago: 'CONTADO',
    });

    expect((await detalleDelDia(diaDeHoy(), 'VES')).totales.ventas).toBe('10000');
    expect((await detalleDelDia(diaDeHoy(), 'USD')).totales.ventas).toBe('11.16');
  });

  it('la lista de días trae una línea por día, aunque no se haya vendido', async () => {
    const { papa, cliente } = await base();
    await crearOperacion({
      tipo: 'VENTA',
      personaId: cliente._id.toString(),
      moneda: 'VES',
      items: [{ productoId: papa._id.toString(), cantidad: '3', precio: '1000' }],
      formaPago: 'CONTADO',
    });

    const dias = await listaDeDias(7, 'VES');

    expect(dias).toHaveLength(7);
    expect(dias[0]!.esHoy).toBe(true);
    expect(dias[0]!.ventas).toBe('3000');
    expect(dias[0]!.cantidadVentas).toBe(1);
    // Los días sin movimiento aparecen igual, en cero: el cuaderno también los tiene.
    expect(dias[1]!.ventas).toBe('0');
  });
});

describe('El cierre de un día no se mueve después', () => {
  beforeAll(async () => {
    await startTestMongo();
  }, 120_000);

  afterAll(async () => {
    await stopTestMongo();
  });

  beforeEach(async () => {
    await clearTestMongo();
    limpiarCache();
  });

  /**
   * Regresión de un fallo real (20/08/2026): el cierre usaba `pagado`, que crece
   * con cada abono. Al cobrar una venta fiada vieja, el día en que se hizo esa
   * venta pasaba a mostrar más "contado" del que hubo, y una venta fiada
   * aparecía en pantalla como si el negocio hubiera pagado algo.
   */
  it('abonar hoy una venta fiada de ayer no cambia el cierre de ayer', async () => {
    const { papa, cliente } = await base();

    await crearOperacion({
      tipo: 'VENTA',
      personaId: cliente._id.toString(),
      moneda: 'VES',
      items: [{ productoId: papa._id.toString(), cantidad: '10', precio: '1000' }],
      formaPago: 'FIADO',
    });

    const antes = await detalleDelDia(diaDeHoy(), 'VES');
    expect(antes.totales.contado).toBe('0');
    expect(antes.totales.fiado).toBe('10000');
    expect(antes.movimientos[0]!.entra).toBeNull();

    // Le abonan después
    await registrarPago({
      personaId: cliente._id.toString(),
      direccion: 'ENTRA',
      monto: '6000',
      moneda: 'VES',
    });

    const despues = await detalleDelDia(diaDeHoy(), 'VES');
    // La venta sigue siendo fiada: lo que entró fue un abono, contado aparte.
    expect(despues.totales.contado).toBe('0');
    expect(despues.totales.fiado).toBe('10000');
    expect(despues.totales.cobros).toBe('6000');
    expect(despues.movimientos.find((m) => m.tipo === 'VENTA')!.entra).toBeNull();
  });

  it('una venta con abono parcial cuenta solo lo que entró en el acto', async () => {
    const { papa, cliente } = await base();

    await crearOperacion({
      tipo: 'VENTA',
      personaId: cliente._id.toString(),
      moneda: 'VES',
      items: [{ productoId: papa._id.toString(), cantidad: '10', precio: '1000' }],
      formaPago: 'PARCIAL',
      pagado: '4000',
    });

    const dia = await detalleDelDia(diaDeHoy(), 'VES');
    expect(dia.totales.contado).toBe('4000');
    expect(dia.totales.fiado).toBe('6000');
    expect(dia.totales.entroMenosSalio).toBe('4000');
  });
});
