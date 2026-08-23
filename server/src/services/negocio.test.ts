import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { D } from '@geovanny/shared';
import { clearTestMongo, startTestMongo, stopTestMongo } from '../test/mongo.js';
import { ProductoModel } from '../models/producto.js';
import { PersonaModel } from '../models/persona.js';
import { MovimientoModel } from '../models/movimiento.js';
import { OperacionModel } from '../models/operacion.js';
import { crearOperacion, anularOperacion, corregirOperacion } from './operaciones.service.js';
import { registrarPago } from './pagos.service.js';
import { limpiarCache, registrarTasa } from './tasas.service.js';
import { resumen } from './resumen.service.js';
import { ajustar } from './inventario.service.js';

/** Tasas reales verificadas el 19/08/2026. */
async function ponerTasa(usdVes = '906.814802') {
  limpiarCache();
  return registrarTasa({ usdCop: '3099.309008', usdVes, mercado: 'PARALELO', fuente: 'MANUAL' });
}

async function crearBase() {
  const papa = await ProductoModel.create({
    nombre: 'PAPA',
    unidad: 'BULTO',
    stock: '0',
    costoPromedio: '0',
  });
  const cliente = await PersonaModel.create({ nombre: 'MEMIN', tipo: 'CLIENTE' });
  const proveedor = await PersonaModel.create({ nombre: 'HIJINIO', tipo: 'PROVEEDOR' });
  return { papa, cliente, proveedor };
}

describe('El negocio de punta a punta', () => {
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

  describe('Compra (viaje) con cargue', () => {
    it('sube el stock y calcula el costo real incluyendo el cargue (§12)', async () => {
      await ponerTasa();
      const { papa, proveedor } = await crearBase();

      // Viaje real de su archivo: 100 bultos a 104.000 COP + 1.000.000 de cargue
      const viaje = await crearOperacion({
        tipo: 'COMPRA',
        personaId: proveedor._id.toString(),
        moneda: 'COP',
        items: [{ productoId: papa._id.toString(), cantidad: '100', precio: '104000' }],
        cargue: [{ concepto: 'Cargue y transporte', monto: '1000000' }],
        formaPago: 'FIADO',
      });

      expect(viaje.numero).toBe('C-0001');
      expect(viaje.total.monto).toBe('11400000'); // 10.400.000 + 1.000.000

      const actualizado = await ProductoModel.findById(papa._id);
      expect(actualizado!.stock).toBe('100');
      // Costo real = (10.400.000 + 1.000.000) / 100 = 114.000, no 104.000
      expect(actualizado!.costoPromedio).toBe('114000');
    });

    it('deja la deuda con el proveedor', async () => {
      await ponerTasa();
      const { papa, proveedor } = await crearBase();

      await crearOperacion({
        tipo: 'COMPRA',
        personaId: proveedor._id.toString(),
        moneda: 'COP',
        items: [{ productoId: papa._id.toString(), cantidad: '10', precio: '100000' }],
        formaPago: 'FIADO',
      });

      const actualizado = await PersonaModel.findById(proveedor._id);
      expect(actualizado!.saldos.COP).toBe('1000000');
    });
  });

  describe('Venta fiada', () => {
    async function conInventario() {
      await ponerTasa();
      const base = await crearBase();
      await crearOperacion({
        tipo: 'COMPRA',
        personaId: base.proveedor._id.toString(),
        moneda: 'COP',
        items: [{ productoId: base.papa._id.toString(), cantidad: '100', precio: '114000' }],
        formaPago: 'CONTADO',
      });
      return base;
    }

    it('baja el inventario y sube la deuda del cliente, todo de una vez', async () => {
      const { papa, cliente } = await conInventario();

      const venta = await crearOperacion({
        tipo: 'VENTA',
        personaId: cliente._id.toString(),
        moneda: 'VES',
        items: [{ productoId: papa._id.toString(), cantidad: '20', precio: '700' }],
        formaPago: 'FIADO',
      });

      expect(venta.numero).toBe('V-0001');
      expect(venta.total.monto).toBe('14000');
      // El mismo importe, ya guardado en las tres monedas
      expect(venta.total.eq.VES).toBe('14000');
      expect(venta.total.eq.USD).toBe('15.44');

      expect((await ProductoModel.findById(papa._id))!.stock).toBe('80');
      expect((await PersonaModel.findById(cliente._id))!.saldos.VES).toBe('14000');
      expect(await MovimientoModel.countDocuments({ tipo: 'VENTA' })).toBe(1);
    });

    it('calcula la utilidad con el costo real del producto', async () => {
      const { papa, cliente } = await conInventario();

      const venta = await crearOperacion({
        tipo: 'VENTA',
        personaId: cliente._id.toString(),
        moneda: 'COP',
        items: [{ productoId: papa._id.toString(), cantidad: '10', precio: '150000' }],
        formaPago: 'CONTADO',
      });

      // Vendió en 1.500.000 lo que costó 1.140.000
      expect(venta.costoTotal).toBe('1140000');
      expect(venta.utilidad).toBe('360000');
    });

    it('avisa cuando no hay existencias suficientes', async () => {
      const { papa, cliente } = await conInventario();

      await expect(
        crearOperacion({
          tipo: 'VENTA',
          personaId: cliente._id.toString(),
          moneda: 'VES',
          items: [{ productoId: papa._id.toString(), cantidad: '500', precio: '700' }],
          formaPago: 'CONTADO',
        }),
      ).rejects.toThrow(/Solo quedan 100 bultos de PAPA/);
    });

    it('permite vender sin existencias si se fuerza (así trabaja hoy)', async () => {
      const { papa, cliente } = await conInventario();

      const venta = await crearOperacion({
        tipo: 'VENTA',
        personaId: cliente._id.toString(),
        moneda: 'VES',
        items: [{ productoId: papa._id.toString(), cantidad: '500', precio: '700' }],
        formaPago: 'FIADO',
        permitirStockNegativo: true,
      });

      expect(venta.numero).toBeTruthy();
      expect((await ProductoModel.findById(papa._id))!.stock).toBe('-400');
    });

    it('no deja pagar más que el total', async () => {
      const { papa, cliente } = await conInventario();
      await expect(
        crearOperacion({
          tipo: 'VENTA',
          personaId: cliente._id.toString(),
          moneda: 'VES',
          items: [{ productoId: papa._id.toString(), cantidad: '1', precio: '700' }],
          formaPago: 'PARCIAL',
          pagado: '9000',
        }),
      ).rejects.toThrow(/no puede superar el total/);
    });
  });

  describe('Abonos', () => {
    async function conDeuda(moneda: 'VES' | 'USD' = 'VES') {
      await ponerTasa();
      const base = await crearBase();
      await crearOperacion({
        tipo: 'COMPRA',
        personaId: base.proveedor._id.toString(),
        moneda: 'COP',
        items: [{ productoId: base.papa._id.toString(), cantidad: '100', precio: '114000' }],
        formaPago: 'CONTADO',
      });
      const venta = await crearOperacion({
        tipo: 'VENTA',
        personaId: base.cliente._id.toString(),
        moneda,
        items: [{ productoId: base.papa._id.toString(), cantidad: '10', precio: '100' }],
        formaPago: 'FIADO',
      });
      return { ...base, venta };
    }

    it('un abono parcial baja el saldo y deja la venta al día', async () => {
      const { cliente, venta } = await conDeuda();

      await registrarPago({
        personaId: cliente._id.toString(),
        direccion: 'ENTRA',
        monto: '400',
        moneda: 'VES',
      });

      expect((await PersonaModel.findById(cliente._id))!.saldos.VES).toBe('600');
      const actualizada = await OperacionModel.findById(venta._id);
      expect(actualizada!.pagado).toBe('400');
      expect(actualizada!.saldo).toBe('600');
    });

    it('paga una deuda en dólares con bolívares (§8)', async () => {
      const { cliente } = await conDeuda('USD');
      // Debe 1.000 USD. Paga en bolívares al cambio del día.
      const pago = await registrarPago({
        personaId: cliente._id.toString(),
        direccion: 'ENTRA',
        monto: '906814.80',
        moneda: 'VES',
        aplicaA: 'USD',
      });

      expect(pago.importe.moneda).toBe('VES');
      expect(pago.aplicaA).toBe('USD');
      expect(pago.montoAplicado).toBe('1000'); // 906.814,80 Bs ÷ 906,814802
      expect((await PersonaModel.findById(cliente._id))!.saldos.USD).toBe('0');
    });

    it('deja constancia de la tasa acordada cuando se pacta una distinta (§21)', async () => {
      const { cliente } = await conDeuda('USD');

      const pago = await registrarPago({
        personaId: cliente._id.toString(),
        direccion: 'ENTRA',
        monto: '900000',
        moneda: 'VES',
        aplicaA: 'USD',
        tasaAcordada: { usdCop: '3099.309008', usdVes: '900' },
      });

      expect(pago.importe.tasa.mercado).toBe('ACORDADA');
      expect(pago.importe.tasa.usdVes).toBe('900');
      expect(pago.montoAplicado).toBe('1000');
    });

    it('lo que sobra queda a favor del cliente, no se pierde', async () => {
      const { cliente } = await conDeuda();

      const pago = await registrarPago({
        personaId: cliente._id.toString(),
        direccion: 'ENTRA',
        monto: '1500',
        moneda: 'VES',
      });

      expect(pago.aFavor).toBe('500');
      expect((await PersonaModel.findById(cliente._id))!.saldos.VES).toBe('-500');
    });

    it('reparte un abono entre varias ventas, de la más antigua a la más nueva', async () => {
      const { cliente, papa } = await conDeuda();
      await crearOperacion({
        tipo: 'VENTA',
        personaId: cliente._id.toString(),
        moneda: 'VES',
        items: [{ productoId: papa._id.toString(), cantidad: '5', precio: '100' }],
        formaPago: 'FIADO',
      });

      const pago = await registrarPago({
        personaId: cliente._id.toString(),
        direccion: 'ENTRA',
        monto: '1200',
        moneda: 'VES',
      });

      expect(pago.asignaciones).toHaveLength(2);
      expect(pago.asignaciones[0]!.monto).toBe('1000'); // salda la primera
      expect(pago.asignaciones[1]!.monto).toBe('200'); // abona a la segunda
    });
  });

  describe('Anulación', () => {
    it('deja el inventario y la deuda como estaban (INV-5)', async () => {
      await ponerTasa();
      const { papa, cliente, proveedor } = await crearBase();
      await crearOperacion({
        tipo: 'COMPRA',
        personaId: proveedor._id.toString(),
        moneda: 'COP',
        items: [{ productoId: papa._id.toString(), cantidad: '100', precio: '114000' }],
        formaPago: 'CONTADO',
      });

      const venta = await crearOperacion({
        tipo: 'VENTA',
        personaId: cliente._id.toString(),
        moneda: 'VES',
        items: [{ productoId: papa._id.toString(), cantidad: '20', precio: '700' }],
        formaPago: 'FIADO',
      });

      await anularOperacion(venta._id.toString(), 'Se equivocó de cliente');

      expect((await ProductoModel.findById(papa._id))!.stock).toBe('100');
      expect((await PersonaModel.findById(cliente._id))!.saldos.VES).toBe('0');
      expect((await OperacionModel.findById(venta._id))!.estado).toBe('ANULADA');
    });
  });

  describe('Inventario', () => {
    it('la merma sale del stock y queda registrada con su motivo', async () => {
      await ponerTasa();
      const { papa, proveedor } = await crearBase();
      await crearOperacion({
        tipo: 'COMPRA',
        personaId: proveedor._id.toString(),
        moneda: 'COP',
        items: [{ productoId: papa._id.toString(), cantidad: '100', precio: '114000' }],
        formaPago: 'CONTADO',
      });

      await ajustar({
        productoId: papa._id.toString(),
        cantidad: '-3',
        tipo: 'MERMA',
        motivo: 'Bultos dañados en el viaje',
      });

      expect((await ProductoModel.findById(papa._id))!.stock).toBe('97');
      const movimiento = await MovimientoModel.findOne({ tipo: 'MERMA' });
      expect(movimiento!.motivo).toBe('Bultos dañados en el viaje');
    });

    it('exige motivo en todo ajuste (RC-10)', async () => {
      await ponerTasa();
      const { papa } = await crearBase();
      await expect(
        ajustar({ productoId: papa._id.toString(), cantidad: '-1', tipo: 'MERMA', motivo: '  ' }),
      ).rejects.toThrow(/motivo/i);
    });
  });

  describe('Inicio: las mismas cifras en las tres monedas (§19)', () => {
    it('muestra el mismo negocio convertido, sin cambiar ningún dato', async () => {
      await ponerTasa();
      const { papa, cliente, proveedor } = await crearBase();
      await crearOperacion({
        tipo: 'COMPRA',
        personaId: proveedor._id.toString(),
        moneda: 'COP',
        items: [{ productoId: papa._id.toString(), cantidad: '100', precio: '100000' }],
        formaPago: 'FIADO',
      });
      await crearOperacion({
        tipo: 'VENTA',
        personaId: cliente._id.toString(),
        moneda: 'VES',
        items: [{ productoId: papa._id.toString(), cantidad: '10', precio: '1000' }],
        formaPago: 'FIADO',
      });

      const enCop = await resumen('COP');
      const enUsd = await resumen('USD');
      const enVes = await resumen('VES');
      if (enCop.sinTasa || enUsd.sinTasa || enVes.sinTasa) throw new Error('debía haber tasa');

      // La deuda del cliente son 10.000 Bs en las tres vistas
      expect(enVes.meDeben.porMoneda.VES).toBe('10000');
      expect(enCop.meDeben.porMoneda.VES).toBe('10000');

      // Y el consolidado cambia de moneda, no de valor
      expect(enVes.meDeben.total).toBe('10000');
      expect(enUsd.meDeben.total).toBe('11.03');
      expect(D(enCop.meDeben.total).greaterThan(D('34000'))).toBe(true);

      // Lo que debe a proveedores son 10.000.000 COP
      expect(enCop.debo.porMoneda.COP).toBe('10000000');
    });

    it('avisa cuando todavía no hay tasa, en vez de inventarse uno', async () => {
      const vacio = await resumen('COP');
      expect(vacio.sinTasa).toBe(true);
    });
  });
});

/** Base del bloque de correcciones: tasa puesta y papa con existencias. */
async function baseConStock() {
  await ponerTasa();
  const { cliente, proveedor } = await crearBase();
  const papa = (await ProductoModel.findOneAndUpdate(
    { nombre: 'PAPA' },
    { $set: { stock: '100', costoPromedio: '500' } },
    { new: true },
  ))!;
  return { cliente, proveedor, papa };
}

describe('Corregir una venta ya registrada', () => {
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

  it('rehace el inventario con la cantidad correcta', async () => {
    const { cliente, papa } = await baseConStock();

    const venta = await crearOperacion({
      tipo: 'VENTA',
      personaId: cliente._id.toString(),
      moneda: 'VES',
      items: [{ productoId: papa._id.toString(), cantidad: '12', precio: '1000' }],
      formaPago: 'FIADO',
    });
    const stockTrasVender = (await ProductoModel.findById(papa._id))!.stock;

    // Eran 10, no 12.
    const corregida = await corregirOperacion(venta._id.toString(), {
      items: [{ productoId: papa._id.toString(), cantidad: '10', precio: '1000' }],
    });

    expect(corregida.numero).not.toBe(venta.numero);
    expect((await OperacionModel.findById(venta._id))!.estado).toBe('ANULADA');
    // 12 fuera, 12 de vuelta, 10 fuera: dos bultos más que antes de corregir.
    expect((await ProductoModel.findById(papa._id))!.stock).toBe(
      D(stockTrasVender).plus(2).toString(),
    );
    expect(corregida.total.monto).toBe('10000');
  });

  it('deja la deuda del cliente en el valor corregido, sin duplicarla', async () => {
    const { cliente, papa } = await baseConStock();

    const venta = await crearOperacion({
      tipo: 'VENTA',
      personaId: cliente._id.toString(),
      moneda: 'VES',
      items: [{ productoId: papa._id.toString(), cantidad: '12', precio: '1000' }],
      formaPago: 'FIADO',
    });
    expect((await PersonaModel.findById(cliente._id))!.saldos.VES).toBe('12000');

    await corregirOperacion(venta._id.toString(), {
      items: [{ productoId: papa._id.toString(), cantidad: '10', precio: '1000' }],
    });

    expect((await PersonaModel.findById(cliente._id))!.saldos.VES).toBe('10000');
  });

  /**
   * Lo que se protege aquí: corregir una cantidad no puede revaluar una venta
   * vieja con la tasa de hoy, porque eso movería el cierre de aquel día (RC-03).
   */
  it('conserva la tasa del día original', async () => {
    const { cliente, papa } = await baseConStock();

    const venta = await crearOperacion({
      tipo: 'VENTA',
      personaId: cliente._id.toString(),
      moneda: 'VES',
      items: [{ productoId: papa._id.toString(), cantidad: '10', precio: '1000' }],
      formaPago: 'FIADO',
    });

    // Al día siguiente el bolívar se devalúa a la mitad.
    limpiarCache();
    await registrarTasa({
      usdCop: '3099.309008',
      usdVes: '1792.448992',
      mercado: 'PARALELO',
      fuente: 'MANUAL',
    });

    const corregida = await corregirOperacion(venta._id.toString(), {
      items: [{ productoId: papa._id.toString(), cantidad: '9', precio: '1000' }],
    });

    expect(corregida.total.tasa.usdVes).toBe(venta.total.tasa.usdVes);
  });

  it('la nota se arregla en el sitio, sin anular nada', async () => {
    const { cliente, papa } = await baseConStock();

    const venta = await crearOperacion({
      tipo: 'VENTA',
      personaId: cliente._id.toString(),
      moneda: 'VES',
      items: [{ productoId: papa._id.toString(), cantidad: '10', precio: '1000' }],
      formaPago: 'FIADO',
    });

    const corregida = await corregirOperacion(venta._id.toString(), { nota: 'Se la llevó Wilmer' });

    expect(corregida!._id.toString()).toBe(venta._id.toString());
    expect(corregida!.nota).toBe('Se la llevó Wilmer');
    expect(corregida!.estado).toBe('ACTIVA');
    expect(await OperacionModel.countDocuments({ tipo: 'VENTA' })).toBe(1);
  });

  it('no se corrige una venta que ya recibió abonos', async () => {
    const { cliente, papa } = await baseConStock();

    const venta = await crearOperacion({
      tipo: 'VENTA',
      personaId: cliente._id.toString(),
      moneda: 'VES',
      items: [{ productoId: papa._id.toString(), cantidad: '10', precio: '1000' }],
      formaPago: 'FIADO',
    });
    await registrarPago({
      personaId: cliente._id.toString(),
      direccion: 'ENTRA',
      monto: '3000',
      moneda: 'VES',
    });

    await expect(
      corregirOperacion(venta._id.toString(), {
        items: [{ productoId: papa._id.toString(), cantidad: '9', precio: '1000' }],
      }),
    ).rejects.toThrow(/abonos/i);
  });
});
