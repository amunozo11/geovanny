import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { clearTestMongo, startTestMongo, stopTestMongo } from '../test/mongo.js';
import { D } from '@geovanny/shared';
import { ProductoModel } from '../models/producto.js';
import { PersonaModel } from '../models/persona.js';
import { MovimientoModel } from '../models/movimiento.js';
import { CajaModel } from '../models/caja.js';
import { OperacionModel } from '../models/operacion.js';
import { limpiarCache, registrarTasa } from './tasas.service.js';
import { crearOperacion, anularOperacion } from './operaciones.service.js';
import { crearProducto, eliminarProducto, ajustar } from './inventario.service.js';
import { delDia, registrar, registrarLote } from './ventasTotales.service.js';
import { detalleDelDia } from './dias.service.js';
import { diaDeHoy } from '../lib/dias.js';

async function base() {
  limpiarCache();
  await registrarTasa({
    usdCop: '4000',
    usdVes: '200',
    mercado: 'PARALELO',
    fuente: 'MANUAL',
  });
  const papa = await ProductoModel.create({
    nombre: 'PAPA',
    unidad: 'BULTO',
    stock: '100',
    costoPromedio: '50000',
  });
  return { papa };
}

describe('Ventas totales (mostrador, sin cliente)', () => {
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

  it('registra una venta sin cliente, descuenta inventario y congela las tres monedas', async () => {
    const { papa } = await base();

    const venta = await registrar({
      productoId: papa._id.toString(),
      cantidad: '2',
      precio: '10',
      moneda: 'USD',
    });

    expect(venta.canal).toBe('DIRECTA');
    expect(venta.personaId).toBeNull();
    expect(venta.formaPago).toBe('CONTADO');
    expect(venta.saldo).toBe('0');

    // 2 × 10 USD, con 1 USD = 4000 COP = 200 VES.
    expect(venta.total.eq.USD).toBe('20');
    expect(venta.total.eq.COP).toBe('80000');
    expect(venta.total.eq.VES).toBe('4000');

    const despues = await ProductoModel.findById(papa._id);
    expect(despues!.stock).toBe('98');
  });

  it('no crea ninguna persona por el camino', async () => {
    const { papa } = await base();
    await registrar({ productoId: papa._id.toString(), cantidad: '1', precio: '5', moneda: 'USD' });
    expect(await PersonaModel.countDocuments()).toBe(0);
  });

  it('no deja fiar lo que no tiene a quién cobrarse', async () => {
    const { papa } = await base();

    await expect(
      crearOperacion({
        tipo: 'VENTA',
        canal: 'DIRECTA',
        personaId: null,
        moneda: 'USD',
        items: [{ productoId: papa._id.toString(), cantidad: '1', precio: '5' }],
        formaPago: 'FIADO',
      }),
    ).rejects.toThrow(/se cobra en el momento/i);
  });

  it('la plata entra en la caja de su moneda', async () => {
    const { papa } = await base();
    const caja = await CajaModel.create({ nombre: 'Efectivo dólares', moneda: 'USD' });

    await registrar({ productoId: papa._id.toString(), cantidad: '3', precio: '10', moneda: 'USD' });

    const despues = await CajaModel.findById(caja._id);
    expect(despues!.saldo).toBe('30');
  });

  it('se para si no hay existencias, y se puede registrar igual si se confirma', async () => {
    const { papa } = await base();
    await ProductoModel.updateOne({ _id: papa._id }, { $set: { stock: '1' } });

    const linea = {
      productoId: papa._id.toString(),
      cantidad: '5',
      precio: '10',
      moneda: 'USD' as const,
    };

    await expect(registrar(linea)).rejects.toThrow(/solo quedan/i);

    const forzada = await registrar({ ...linea, forzar: true });
    expect(forzada.numero).toMatch(/^V-/);
    expect((await ProductoModel.findById(papa._id))!.stock).toBe('-4');
  });

  describe('Guardar varias de una vez', () => {
    it('guarda todas y devuelve el número de cada una', async () => {
      const { papa } = await base();
      const ajo = await ProductoModel.create({ nombre: 'AJO', unidad: 'CAJA', stock: '10' });

      const resultado = await registrarLote([
        { productoId: papa._id.toString(), cantidad: '2', precio: '10', moneda: 'USD' },
        { productoId: ajo._id.toString(), cantidad: '1', precio: '25', moneda: 'USD' },
      ]);

      expect(resultado.fallidas).toHaveLength(0);
      expect(resultado.guardadas.map((g) => g.indice)).toEqual([0, 1]);
      expect(await OperacionModel.countDocuments({ canal: 'DIRECTA' })).toBe(2);
    });

    it('si una falla, las demás siguen guardadas y se dice cuál fue', async () => {
      const { papa } = await base();
      const ajo = await ProductoModel.create({ nombre: 'AJO', unidad: 'CAJA', stock: '0' });

      const resultado = await registrarLote([
        { productoId: papa._id.toString(), cantidad: '2', precio: '10', moneda: 'USD' },
        { productoId: ajo._id.toString(), cantidad: '5', precio: '25', moneda: 'USD' },
        { productoId: papa._id.toString(), cantidad: '1', precio: '10', moneda: 'USD' },
      ]);

      expect(resultado.guardadas.map((g) => g.indice)).toEqual([0, 2]);
      expect(resultado.fallidas).toHaveLength(1);
      expect(resultado.fallidas[0]!.indice).toBe(1);
      expect(resultado.fallidas[0]!.codigo).toBe('SIN_STOCK');

      // Las dos buenas quedaron guardadas de verdad, no a medias.
      expect((await ProductoModel.findById(papa._id))!.stock).toBe('97');
    });
  });

  describe('Cada registro lleva su propia moneda', () => {
    it('en una misma tanda pueden convivir dólares y bolívares', async () => {
      const { papa } = await base();
      const ajo = await ProductoModel.create({ nombre: 'AJO', unidad: 'CAJA', stock: '10' });

      const resultado = await registrarLote([
        { productoId: papa._id.toString(), cantidad: '2', precio: '10', moneda: 'USD' },
        { productoId: ajo._id.toString(), cantidad: '1', precio: '4000', moneda: 'VES' },
      ]);
      expect(resultado.fallidas).toHaveLength(0);

      const corte = await delDia(diaDeHoy());

      // Lo cobrado NO se mezcla: 20 dólares en un bolsillo, 4.000 bolívares en
      // el otro. Es lo que de verdad tiene en la mano.
      expect(corte.totales.cobrado.USD).toBe('20');
      expect(corte.totales.cobrado.VES).toBe('4000');
      expect(corte.totales.cobrado.COP).toBe('0');

      // El equivalente sí lo junta todo: 20 USD + 4000 VES = 40 USD.
      expect(corte.totales.porMoneda.USD).toBe('40');
      expect(corte.totales.porMoneda.VES).toBe('8000');
      expect(corte.totales.porMoneda.COP).toBe('160000');
    });

    it('el desglose por producto también separa lo cobrado de lo convertido', async () => {
      const { papa } = await base();

      await registrarLote([
        { productoId: papa._id.toString(), cantidad: '2', precio: '10', moneda: 'USD' },
        { productoId: papa._id.toString(), cantidad: '1', precio: '4000', moneda: 'VES' },
      ]);

      const corte = await delDia(diaDeHoy());
      const fila = corte.porProducto.find((p) => p.nombre === 'PAPA')!;

      expect(fila.cantidad).toBe('3');
      expect(fila.registros).toBe(2);
      expect(fila.cobrado.USD).toBe('20');
      expect(fila.cobrado.VES).toBe('4000');
      expect(fila.totalPorMoneda.USD).toBe('40');
    });

    it('cada venta entra en la caja de su moneda', async () => {
      const { papa } = await base();
      const enDolares = await CajaModel.create({ nombre: 'Dólares', moneda: 'USD' });
      const enBolivares = await CajaModel.create({ nombre: 'Bolívares', moneda: 'VES' });

      await registrarLote([
        { productoId: papa._id.toString(), cantidad: '2', precio: '10', moneda: 'USD' },
        { productoId: papa._id.toString(), cantidad: '1', precio: '4000', moneda: 'VES' },
      ]);

      expect((await CajaModel.findById(enDolares._id))!.saldo).toBe('20');
      expect((await CajaModel.findById(enBolivares._id))!.saldo).toBe('4000');
    });
  });

  describe('El corte del día', () => {
    it('suma cuánto se vendió y en cuánto sale en cada moneda', async () => {
      const { papa } = await base();
      const ajo = await ProductoModel.create({ nombre: 'AJO', unidad: 'CAJA', stock: '10' });

      await registrarLote([
        { productoId: papa._id.toString(), cantidad: '2', precio: '10', moneda: 'USD' },
        { productoId: ajo._id.toString(), cantidad: '1', precio: '25', moneda: 'USD' },
      ]);

      const corte = await delDia(diaDeHoy());

      expect(corte.totales.registros).toBe(2);
      expect(corte.totales.unidades).toBe('3');
      expect(corte.totales.porMoneda.USD).toBe('45');
      expect(corte.totales.porMoneda.VES).toBe('9000');
      expect(corte.totales.porMoneda.COP).toBe('180000');

      const papaEnCorte = corte.porProducto.find((p) => p.nombre === 'PAPA')!;
      expect(papaEnCorte.cantidad).toBe('2');
      expect(papaEnCorte.totalPorMoneda.USD).toBe('20');
    });

    it('cada día trae solo lo suyo', async () => {
      const { papa } = await base();
      const ayer = new Date(Date.now() - 24 * 3_600_000);

      await registrar({
        productoId: papa._id.toString(),
        cantidad: '1',
        precio: '10',
        moneda: 'USD',
        fecha: ayer.toISOString(),
      });
      await registrar({
        productoId: papa._id.toString(),
        cantidad: '3',
        precio: '10',
        moneda: 'USD',
      });

      const hoy = await delDia(diaDeHoy());
      expect(hoy.totales.registros).toBe(1);
      expect(hoy.totales.porMoneda.USD).toBe('30');

      const elDeAyer = await delDia(diaDeHoy(ayer));
      expect(elDeAyer.totales.registros).toBe(1);
      expect(elDeAyer.totales.porMoneda.USD).toBe('10');
      expect(elDeAyer.esHoy).toBe(false);
    });

    it('no cuenta las ventas con cliente ni las anuladas', async () => {
      const { papa } = await base();
      const cliente = await PersonaModel.create({ nombre: 'MEMIN', tipo: 'CLIENTE' });

      await crearOperacion({
        tipo: 'VENTA',
        personaId: cliente._id.toString(),
        moneda: 'USD',
        items: [{ productoId: papa._id.toString(), cantidad: '1', precio: '10' }],
        formaPago: 'CONTADO',
      });

      const directa = await registrar({
        productoId: papa._id.toString(),
        cantidad: '1',
        precio: '10',
        moneda: 'USD',
      });
      await anularOperacion(directa._id.toString(), 'Me equivoqué');

      const corte = await delDia(diaDeHoy());
      expect(corte.totales.registros).toBe(0);
      expect(corte.totales.porMoneda.USD).toBe('0');
    });

    it('anular devuelve la mercancía al inventario', async () => {
      const { papa } = await base();
      const venta = await registrar({
        productoId: papa._id.toString(),
        cantidad: '4',
        precio: '10',
        moneda: 'USD',
      });

      expect((await ProductoModel.findById(papa._id))!.stock).toBe('96');
      await anularOperacion(venta._id.toString(), 'Registro equivocado');
      expect((await ProductoModel.findById(papa._id))!.stock).toBe('100');
    });
  });

  it('cuenta en el cierre del día como cualquier otra venta', async () => {
    const { papa } = await base();
    await registrar({ productoId: papa._id.toString(), cantidad: '2', precio: '10', moneda: 'USD' });

    const dia = await detalleDelDia(diaDeHoy(), 'USD');

    expect(dia.totales.cantidadVentas).toBe(1);
    expect(D(dia.totales.ventas).toString()).toBe('20');
    // Se cobró en el acto: entra completa como contado, no como fiado.
    expect(D(dia.totales.contado).toString()).toBe('20');
    expect(dia.movimientos[0]!.titulo).toBe('Venta total');
  });
});

describe('Productos: crear con lo que ya hay, editar y quitar', () => {
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

  it('crea el producto con las existencias que ya tenía, y deja escrito de dónde salieron', async () => {
    await base();

    const producto = await crearProducto({
      nombre: 'CEBOLLA',
      unidad: 'BULTO',
      precioVenta: '0',
      monedaVenta: 'VES',
      stockMinimo: '0',
      cantidadInicial: '30',
      costoUnitario: '10',
      monedaCosto: 'USD',
    });

    expect(producto!.stock).toBe('30');
    // 10 USD por bulto a 4000 COP/USD.
    expect(producto!.costoPromedio).toBe('40000');

    const movimientos = await MovimientoModel.find({ productoId: producto!._id });
    expect(movimientos).toHaveLength(1);
    expect(movimientos[0]!.motivo).toMatch(/existencia inicial/i);
    expect(movimientos[0]!.cantidad).toBe('30');
  });

  it('sin cantidad inicial arranca en cero y sin movimientos', async () => {
    await base();
    const producto = await crearProducto({
      nombre: 'AJO',
      unidad: 'CAJA',
      precioVenta: '0',
      monedaVenta: 'VES',
      stockMinimo: '0',
    });

    expect(producto!.stock).toBe('0');
    expect(await MovimientoModel.countDocuments({ productoId: producto!._id })).toBe(0);
  });

  it('avisa en vez de crear dos productos con el mismo nombre', async () => {
    await base();
    await expect(
      crearProducto({
        nombre: 'PAPA',
        unidad: 'BULTO',
        precioVenta: '0',
        monedaVenta: 'VES',
        stockMinimo: '0',
      }),
    ).rejects.toThrow(/ya tienes un producto/i);
  });

  it('un producto sin historial se borra de verdad y su nombre queda libre', async () => {
    await base();
    const ajo = await ProductoModel.create({ nombre: 'AJO', unidad: 'CAJA' });

    const resultado = await eliminarProducto(ajo._id.toString());
    expect(resultado.definitivo).toBe(true);
    expect(await ProductoModel.findById(ajo._id)).toBeNull();

    const otra = await crearProducto({
      nombre: 'AJO',
      unidad: 'CAJA',
      precioVenta: '0',
      monedaVenta: 'VES',
      stockMinimo: '0',
    });
    expect(otra!.activo).toBe(true);
  });

  it('un producto con historial solo se oculta: las ventas viejas siguen enteras', async () => {
    const { papa } = await base();
    await registrar({ productoId: papa._id.toString(), cantidad: '1', precio: '10', moneda: 'USD' });

    const resultado = await eliminarProducto(papa._id.toString());
    expect(resultado.definitivo).toBe(false);

    const despues = await ProductoModel.findById(papa._id);
    expect(despues!.activo).toBe(false);
    expect(await MovimientoModel.countDocuments({ productoId: papa._id })).toBe(1);
  });

  it('volver a crear un producto oculto lo reactiva con su historial', async () => {
    const { papa } = await base();
    await registrar({ productoId: papa._id.toString(), cantidad: '1', precio: '10', moneda: 'USD' });
    await eliminarProducto(papa._id.toString());

    const revivido = await crearProducto({
      nombre: 'PAPA',
      unidad: 'BULTO',
      precioVenta: '0',
      monedaVenta: 'VES',
      stockMinimo: '0',
    });

    expect(revivido!._id.toString()).toBe(papa._id.toString());
    expect(revivido!.activo).toBe(true);
    expect(revivido!.stock).toBe('99');
  });

  describe('Actualizar la cantidad', () => {
    it('con un conteo: se dice cuánto hay y el sistema saca la diferencia', async () => {
      const { papa } = await base();

      const despues = await ajustar({
        productoId: papa._id.toString(),
        nuevaCantidad: '87',
        tipo: 'AJUSTE',
        motivo: 'Conteo del sábado',
      });

      expect(despues!.stock).toBe('87');
      const movimiento = await MovimientoModel.findOne({ productoId: papa._id });
      expect(movimiento!.cantidad).toBe('-13');
    });

    it('si el conteo coincide, no inventa un movimiento vacío', async () => {
      const { papa } = await base();
      await expect(
        ajustar({
          productoId: papa._id.toString(),
          nuevaCantidad: '100',
          tipo: 'AJUSTE',
          motivo: 'Conteo',
        }),
      ).rejects.toThrow(/no hay nada que ajustar/i);
    });

    it('sigue aceptando la diferencia directa, para entradas y mermas', async () => {
      const { papa } = await base();
      const despues = await ajustar({
        productoId: papa._id.toString(),
        cantidad: '-3',
        tipo: 'MERMA',
        motivo: 'Se dañaron',
      });
      expect(despues!.stock).toBe('97');
    });
  });
});
