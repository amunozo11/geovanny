import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { clearTestMongo, startTestMongo, stopTestMongo } from '../test/mongo.js';
import { ProductoModel } from '../models/producto.js';
import { PersonaModel } from '../models/persona.js';
import { CajaModel } from '../models/caja.js';
import { CargoModel } from '../models/cargo.js';
import { OperacionModel } from '../models/operacion.js';
import { PagoModel } from '../models/pago.js';
import { GastoModel } from '../models/gasto.js';
import { limpiarCache, registrarTasa } from './tasas.service.js';
import { crearOperacion } from './operaciones.service.js';
import { registrar as venderTotal } from './ventasTotales.service.js';
import { registrarCargo, anularCargo, corregirCargo } from './cargos.service.js';
import { registrarPago, anularPago, corregirPago } from './pagos.service.js';
import { guardarCierre, informeDelDia } from './todo.service.js';
import { anularGasto, registrarGasto } from './gastos.service.js';
import { siguienteNumero } from '../models/contador.js';
import { crearImporte } from '@geovanny/shared';
import { diaDeHoy } from '../lib/dias.js';

async function base() {
  limpiarCache();
  const tasa = await registrarTasa({
    usdCop: '4000',
    usdVes: '200',
    mercado: 'PARALELO',
    fuente: 'MANUAL',
  });
  const papa = await ProductoModel.create({
    nombre: 'PAPA',
    unidad: 'BULTO',
    stock: '100',
    costoPromedio: '10000',
  });
  const cliente = await PersonaModel.create({ nombre: 'MEMIN', tipo: 'CLIENTE' });
  return { tasa, papa, cliente };
}

/** Un gasto directo, sin pasar por la ruta HTTP. */
async function gastar(monto: string, moneda: 'COP' | 'USD' | 'VES', descripcion = 'gasolina') {
  const tasa = await registrarTasa({
    usdCop: '4000',
    usdVes: '200',
    mercado: 'PARALELO',
    fuente: 'MANUAL',
  });
  return GastoModel.create({
    numero: await siguienteNumero('G'),
    categoria: 'COMBUSTIBLE',
    descripcion,
    importe: crearImporte(monto, moneda, tasa),
    fecha: new Date(),
  });
}

describe('Deudas que no vienen de una venta', () => {
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

  it('un préstamo sube la deuda del cliente y saca la plata de la caja', async () => {
    const { cliente } = await base();
    const caja = await CajaModel.create({ nombre: 'Dólares', moneda: 'USD', saldo: '500' });

    const cargo = await registrarCargo({
      personaId: cliente._id.toString(),
      tipo: 'PRESTAMO',
      concepto: 'Préstamo para el flete',
      monto: '100',
      moneda: 'USD',
      cajaId: caja._id.toString(),
    });

    expect(cargo.numero).toMatch(/^D-/);
    expect(cargo.saldo).toBe('100');
    expect(cargo.salioDeCaja).toBe(true);

    expect((await PersonaModel.findById(cliente._id))!.saldos.USD).toBe('100');
    expect((await CajaModel.findById(caja._id))!.saldo).toBe('400');
  });

  it('una deuda pendiente sube el saldo pero no mueve dinero', async () => {
    const { cliente } = await base();
    const caja = await CajaModel.create({ nombre: 'Bolívares', moneda: 'VES', saldo: '1000' });

    await registrarCargo({
      personaId: cliente._id.toString(),
      tipo: 'DEUDA',
      concepto: 'Deuda del cuaderno viejo',
      monto: '5000',
      moneda: 'VES',
    });

    expect((await PersonaModel.findById(cliente._id))!.saldos.VES).toBe('5000');
    // No salió nada: la deuda ya existía, solo se está anotando.
    expect((await CajaModel.findById(caja._id))!.saldo).toBe('1000');
  });

  it('exige decir por qué se debe', async () => {
    const { cliente } = await base();
    await expect(
      registrarCargo({
        personaId: cliente._id.toString(),
        tipo: 'DEUDA',
        concepto: '   ',
        monto: '100',
        moneda: 'USD',
      }),
    ).rejects.toThrow(/por qué/i);
  });

  describe('Se salda con los abonos de siempre', () => {
    it('un abono baja el saldo del préstamo, no queda como saldo a favor', async () => {
      const { cliente } = await base();
      const cargo = await registrarCargo({
        personaId: cliente._id.toString(),
        tipo: 'PRESTAMO',
        concepto: 'Préstamo',
        monto: '100',
        moneda: 'USD',
      });

      const pago = await registrarPago({
        personaId: cliente._id.toString(),
        direccion: 'ENTRA',
        monto: '60',
        moneda: 'USD',
      });

      expect(pago.aFavor).toBe('0');
      expect(pago.asignacionesCargo).toHaveLength(1);
      expect(pago.asignacionesCargo[0]!.monto).toBe('60');

      expect((await CargoModel.findById(cargo._id))!.saldo).toBe('40');
      expect((await PersonaModel.findById(cliente._id))!.saldos.USD).toBe('40');
    });

    it('primero se pagan las ventas y lo que sobre va al préstamo', async () => {
      const { cliente, papa } = await base();

      await crearOperacion({
        tipo: 'VENTA',
        personaId: cliente._id.toString(),
        moneda: 'USD',
        items: [{ productoId: papa._id.toString(), cantidad: '1', precio: '30' }],
        formaPago: 'FIADO',
      });
      const cargo = await registrarCargo({
        personaId: cliente._id.toString(),
        tipo: 'PRESTAMO',
        concepto: 'Préstamo',
        monto: '100',
        moneda: 'USD',
      });

      const pago = await registrarPago({
        personaId: cliente._id.toString(),
        direccion: 'ENTRA',
        monto: '50',
        moneda: 'USD',
      });

      expect(pago.asignaciones[0]!.monto).toBe('30');
      expect(pago.asignacionesCargo[0]!.monto).toBe('20');
      expect((await CargoModel.findById(cargo._id))!.saldo).toBe('80');
    });

    it('anular el abono devuelve el saldo al préstamo', async () => {
      const { cliente } = await base();
      const cargo = await registrarCargo({
        personaId: cliente._id.toString(),
        tipo: 'PRESTAMO',
        concepto: 'Préstamo',
        monto: '100',
        moneda: 'USD',
      });

      const pago = await registrarPago({
        personaId: cliente._id.toString(),
        direccion: 'ENTRA',
        monto: '60',
        moneda: 'USD',
      });
      await anularPago(pago._id.toString(), 'Me equivoqué');

      expect((await CargoModel.findById(cargo._id))!.saldo).toBe('100');
      expect((await PersonaModel.findById(cliente._id))!.saldos.USD).toBe('100');
    });
  });

  describe('Corregir', () => {
    it('cambiar solo el concepto no crea otro documento', async () => {
      const { cliente } = await base();
      const cargo = await registrarCargo({
        personaId: cliente._id.toString(),
        tipo: 'DEUDA',
        concepto: 'Deudda del cuaderrno',
        monto: '100',
        moneda: 'USD',
      });

      const corregido = await corregirCargo(cargo._id.toString(), {
        concepto: 'Deuda del cuaderno viejo',
      });

      expect(corregido!._id.toString()).toBe(cargo._id.toString());
      expect(corregido!.concepto).toBe('Deuda del cuaderno viejo');
      expect(corregido!.estado).toBe('ACTIVO');
      expect(await CargoModel.countDocuments()).toBe(1);
      // Una errata no mueve dinero.
      expect((await PersonaModel.findById(cliente._id))!.saldos.USD).toBe('100');
    });

    it('cambiar el monto anula el viejo y crea uno nuevo, con el saldo bien', async () => {
      const { cliente } = await base();
      const caja = await CajaModel.create({ nombre: 'Dólares', moneda: 'USD', saldo: '500' });

      const cargo = await registrarCargo({
        personaId: cliente._id.toString(),
        tipo: 'PRESTAMO',
        concepto: 'Préstamo',
        monto: '100',
        moneda: 'USD',
        cajaId: caja._id.toString(),
      });

      const corregido = await corregirCargo(cargo._id.toString(), { monto: '150' });

      expect(corregido!._id.toString()).not.toBe(cargo._id.toString());
      expect(corregido!.importe.monto).toBe('150');
      expect((await CargoModel.findById(cargo._id))!.estado).toBe('ANULADO');
      // 100 fuera, 100 de vuelta, 150 fuera: quedan 350, no 250 ni 400.
      expect((await CajaModel.findById(caja._id))!.saldo).toBe('350');
      expect((await PersonaModel.findById(cliente._id))!.saldos.USD).toBe('150');
    });

    it('no se corrige uno que ya recibió abonos', async () => {
      const { cliente } = await base();
      const cargo = await registrarCargo({
        personaId: cliente._id.toString(),
        tipo: 'PRESTAMO',
        concepto: 'Préstamo',
        monto: '100',
        moneda: 'USD',
      });
      await registrarPago({
        personaId: cliente._id.toString(),
        direccion: 'ENTRA',
        monto: '10',
        moneda: 'USD',
      });

      await expect(corregirCargo(cargo._id.toString(), { monto: '150' })).rejects.toThrow(
        /abonos/i,
      );
    });
  });

  describe('Corregir un abono', () => {
    it('cambiar el método se edita en el sitio', async () => {
      const { cliente } = await base();
      await registrarCargo({
        personaId: cliente._id.toString(),
        tipo: 'DEUDA',
        concepto: 'Deuda',
        monto: '100',
        moneda: 'USD',
      });
      const pago = await registrarPago({
        personaId: cliente._id.toString(),
        direccion: 'ENTRA',
        monto: '40',
        moneda: 'USD',
      });

      const corregido = await corregirPago(pago._id.toString(), { metodo: 'TRANSFERENCIA' });

      expect(corregido!._id.toString()).toBe(pago._id.toString());
      expect(corregido!.metodo).toBe('TRANSFERENCIA');
      expect(await PagoModel.countDocuments({ estado: 'ACTIVO' })).toBe(1);
    });

    it('cambiar el monto rehace la deuda con el valor correcto', async () => {
      const { cliente } = await base();
      const cargo = await registrarCargo({
        personaId: cliente._id.toString(),
        tipo: 'DEUDA',
        concepto: 'Deuda',
        monto: '100',
        moneda: 'USD',
      });
      const pago = await registrarPago({
        personaId: cliente._id.toString(),
        direccion: 'ENTRA',
        monto: '40',
        moneda: 'USD',
      });

      // Eran 60, no 40.
      const corregido = await corregirPago(pago._id.toString(), { monto: '60' });

      expect(corregido!._id.toString()).not.toBe(pago._id.toString());
      expect((await PagoModel.findById(pago._id))!.estado).toBe('ANULADO');
      expect((await CargoModel.findById(cargo._id))!.saldo).toBe('40');
      expect((await PersonaModel.findById(cliente._id))!.saldos.USD).toBe('40');
    });
  });

  describe('Anular', () => {
    it('deshace la deuda y devuelve la plata a la caja', async () => {
      const { cliente } = await base();
      const caja = await CajaModel.create({ nombre: 'Dólares', moneda: 'USD', saldo: '500' });

      const cargo = await registrarCargo({
        personaId: cliente._id.toString(),
        tipo: 'PRESTAMO',
        concepto: 'Préstamo',
        monto: '100',
        moneda: 'USD',
        cajaId: caja._id.toString(),
      });

      await anularCargo(cargo._id.toString(), 'No se lo di al final');

      expect((await PersonaModel.findById(cliente._id))!.saldos.USD).toBe('0');
      expect((await CajaModel.findById(caja._id))!.saldo).toBe('500');
    });

    it('no deja anular uno que ya recibió abonos', async () => {
      const { cliente } = await base();
      const cargo = await registrarCargo({
        personaId: cliente._id.toString(),
        tipo: 'PRESTAMO',
        concepto: 'Préstamo',
        monto: '100',
        moneda: 'USD',
      });
      await registrarPago({
        personaId: cliente._id.toString(),
        direccion: 'ENTRA',
        monto: '10',
        moneda: 'USD',
      });

      await expect(anularCargo(cargo._id.toString(), 'Ups')).rejects.toThrow(/abonos/i);
    });
  });
});

describe('El reporte de deudas', () => {
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

  /** Lo mismo que hace la ruta, sin levantar HTTP. */
  async function reporte(tipo: 'CLIENTE' | 'PROVEEDOR') {
    const consulta =
      tipo === 'CLIENTE'
        ? { tipo: 'CLIENTE', activo: true }
        : { tipo: { $in: ['PROVEEDOR', 'TRANSPORTE'] }, activo: true };
    const personas = await PersonaModel.find(consulta).sort({ nombre: 1 });
    return personas.filter((p) =>
      (['COP', 'USD', 'VES'] as const).some((m) => Number(p.saldos[m] ?? '0') !== 0),
    );
  }

  it('separa lo que me deben de lo que debo', async () => {
    await base();
    const proveedor = await PersonaModel.create({ nombre: 'HIJINIO', tipo: 'PROVEEDOR' });
    const transporte = await PersonaModel.create({ nombre: 'EL CARRO', tipo: 'TRANSPORTE' });

    await registrarCargo({
      personaId: (await PersonaModel.findOne({ nombre: 'MEMIN' }))!._id.toString(),
      tipo: 'DEUDA',
      concepto: 'VIEJO',
      monto: '500',
      moneda: 'USD',
    });
    await PersonaModel.updateOne({ _id: proveedor._id }, { $set: { 'saldos.VES': '900000' } });
    await PersonaModel.updateOne({ _id: transporte._id }, { $set: { 'saldos.USD': '120' } });

    const clientes = await reporte('CLIENTE');
    expect(clientes.map((p) => p.nombre)).toEqual(['MEMIN']);

    // Los de transporte también son gente a la que se le debe.
    const proveedores = await reporte('PROVEEDOR');
    expect(proveedores.map((p) => p.nombre).sort()).toEqual(['EL CARRO', 'HIJINIO']);
  });

  /**
   * El dato que convierte una lista de nombres en una hoja de cobro: no es lo
   * mismo deber cien dólares desde el martes que deberlos desde hace tres
   * meses. Y va por moneda, porque el reporte se lee moneda por moneda.
   */
  it('dice desde cuándo se debe, por moneda', async () => {
    const { papa, cliente } = await base();
    const hace10 = new Date(Date.now() - 10 * 24 * 3_600_000);
    const hace3 = new Date(Date.now() - 3 * 24 * 3_600_000);

    await crearOperacion({
      tipo: 'VENTA',
      personaId: cliente._id.toString(),
      moneda: 'USD',
      items: [{ productoId: papa._id.toString(), cantidad: '1', precio: '50' }],
      formaPago: 'FIADO',
      fecha: hace10.toISOString(),
    });
    // Una más reciente en la misma moneda: no debe mover el "desde".
    await crearOperacion({
      tipo: 'VENTA',
      personaId: cliente._id.toString(),
      moneda: 'USD',
      items: [{ productoId: papa._id.toString(), cantidad: '1', precio: '20' }],
      formaPago: 'FIADO',
      fecha: hace3.toISOString(),
    });
    // Y una deuda en otra moneda, con su propia antigüedad.
    await registrarCargo({
      personaId: cliente._id.toString(),
      tipo: 'DEUDA',
      concepto: 'VIEJO',
      monto: '9000',
      moneda: 'VES',
      fecha: hace3.toISOString(),
    });

    const operaciones = await OperacionModel.find({ estado: 'ACTIVA', saldo: { $ne: '0' } });
    const cargos = await CargoModel.find({ estado: 'ACTIVO', saldo: { $ne: '0' } });

    const masAntiguo = new Map<string, Date>();
    for (const doc of [...operaciones, ...cargos]) {
      const clave = `${doc.personaId!.toString()}|${doc.moneda}`;
      const previo = masAntiguo.get(clave);
      if (!previo || doc.fecha < previo) masAntiguo.set(clave, doc.fecha);
    }

    const id = cliente._id.toString();
    expect(masAntiguo.get(`${id}|USD`)!.toISOString().slice(0, 10)).toBe(
      hace10.toISOString().slice(0, 10),
    );
    expect(masAntiguo.get(`${id}|VES`)!.toISOString().slice(0, 10)).toBe(
      hace3.toISOString().slice(0, 10),
    );
  });

  /**
   * El flujo entero de un proveedor: se crea, se le carga lo que ya se le debía
   * y se le va pagando. Lo que se paga baja la deuda y sale de la caja.
   */
  it('a un proveedor se le carga la deuda y se le va pagando', async () => {
    await base();
    const proveedor = await PersonaModel.create({ nombre: 'HIJINIO', tipo: 'PROVEEDOR' });
    const caja = await CajaModel.create({ nombre: 'Dólares', moneda: 'USD', saldo: '1000' });

    // Lo que ya se le debía, sin mover dinero.
    await registrarCargo({
      personaId: proveedor._id.toString(),
      tipo: 'DEUDA',
      concepto: 'Saldo del viaje del sábado',
      monto: '800',
      moneda: 'USD',
    });

    expect((await PersonaModel.findById(proveedor._id))!.saldos.USD).toBe('800');
    expect((await CajaModel.findById(caja._id))!.saldo).toBe('1000');

    // Un pago, con su fecha.
    const anteayer = new Date(Date.now() - 2 * 24 * 3_600_000);
    await registrarPago({
      personaId: proveedor._id.toString(),
      direccion: 'SALE',
      monto: '300',
      moneda: 'USD',
      cajaId: caja._id.toString(),
      fecha: anteayer.toISOString(),
    });

    expect((await PersonaModel.findById(proveedor._id))!.saldos.USD).toBe('500');
    expect((await CajaModel.findById(caja._id))!.saldo).toBe('700');
  });

  it('se le puede pagar en una moneda distinta a la que se le debe', async () => {
    await base();
    const proveedor = await PersonaModel.create({ nombre: 'HIJINIO', tipo: 'PROVEEDOR' });

    await registrarCargo({
      personaId: proveedor._id.toString(),
      tipo: 'DEUDA',
      concepto: 'Saldo del viaje',
      monto: '20000',
      moneda: 'VES',
    });

    // Se le entregan 50 dólares contra una deuda en bolívares. A 200 Bs/US$,
    // eso descuenta 10.000 de la deuda.
    const pago = await registrarPago({
      personaId: proveedor._id.toString(),
      direccion: 'SALE',
      monto: '50',
      moneda: 'USD',
      aplicaA: 'VES',
    });

    expect(pago.montoAplicado).toBe('10000');
    expect(pago.importe.monto).toBe('50');
    expect((await PersonaModel.findById(proveedor._id))!.saldos.VES).toBe('10000');
  });

  it('deja fuera a quien está al día', async () => {
    await base();
    await PersonaModel.create({ nombre: 'AL DIA', tipo: 'CLIENTE' });

    expect((await reporte('CLIENTE')).map((p) => p.nombre)).toEqual([]);
  });
});

describe('TODO: el día entero, moneda por moneda', () => {
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

  it('separa lo vendido por moneda sin convertir nada', async () => {
    const { papa } = await base();

    await venderTotal({ productoId: papa._id.toString(), cantidad: '2', precio: '10', moneda: 'USD' });
    await venderTotal({
      productoId: papa._id.toString(),
      cantidad: '3',
      precio: '4000',
      moneda: 'VES',
    });

    const informe = await informeDelDia(diaDeHoy());

    expect(informe.ventas.vendido.USD).toBe('20');
    expect(informe.ventas.vendido.VES).toBe('12000');
    expect(informe.ventas.vendido.COP).toBe('0');

    const fila = informe.ventas.porProducto.find((p) => p.nombre === 'PAPA')!;
    expect(fila.cantidad).toBe('5');
    expect(fila.vendido.USD).toBe('20');
    expect(fila.vendido.VES).toBe('12000');
  });

  it('distingue lo que se cobró de lo que quedó fiado', async () => {
    const { papa, cliente } = await base();

    await venderTotal({ productoId: papa._id.toString(), cantidad: '2', precio: '10', moneda: 'USD' });
    await crearOperacion({
      tipo: 'VENTA',
      personaId: cliente._id.toString(),
      moneda: 'USD',
      items: [{ productoId: papa._id.toString(), cantidad: '1', precio: '50' }],
      formaPago: 'FIADO',
    });

    const informe = await informeDelDia(diaDeHoy());

    expect(informe.ventas.vendido.USD).toBe('70');
    expect(informe.ventas.contado.USD).toBe('20');
    expect(informe.ventas.fiado.USD).toBe('50');
    // Lo fiado no entró en el cajón.
    expect(informe.entradas.recogido.USD).toBe('20');
  });

  it('descuenta gastos, abonos a proveedores y préstamos entregados', async () => {
    const { papa, cliente } = await base();

    await venderTotal({
      productoId: papa._id.toString(),
      cantidad: '10',
      precio: '10',
      moneda: 'USD',
    });
    await gastar('15', 'USD', 'gasolina');
    await registrarCargo({
      personaId: cliente._id.toString(),
      tipo: 'PRESTAMO',
      concepto: 'Préstamo',
      monto: '25',
      moneda: 'USD',
    });

    const informe = await informeDelDia(diaDeHoy());

    expect(informe.entradas.recogido.USD).toBe('100');
    expect(informe.salidas.gastado.USD).toBe('15');
    expect(informe.salidas.prestado.USD).toBe('25');
    expect(informe.salidas.total.USD).toBe('40');
    expect(informe.queda.USD).toBe('60');
    expect(informe.deberiaQuedar.USD).toBe('60');
  });

  it('suma los abonos de clientes a lo recogido', async () => {
    const { cliente } = await base();
    await registrarCargo({
      personaId: cliente._id.toString(),
      tipo: 'DEUDA',
      concepto: 'Deuda vieja',
      monto: '80',
      moneda: 'USD',
    });
    await registrarPago({
      personaId: cliente._id.toString(),
      direccion: 'ENTRA',
      monto: '30',
      moneda: 'USD',
    });

    const informe = await informeDelDia(diaDeHoy());
    expect(informe.entradas.cobrado.USD).toBe('30');
    expect(informe.entradas.recogido.USD).toBe('30');
  });

  describe('El detalle con nombres', () => {
    it('cada producto trae quién se lo llevó y qué quedó fiado', async () => {
      const { papa, cliente } = await base();

      await venderTotal({
        productoId: papa._id.toString(),
        cantidad: '8',
        precio: '10',
        moneda: 'USD',
      });
      await crearOperacion({
        tipo: 'VENTA',
        personaId: cliente._id.toString(),
        moneda: 'USD',
        items: [{ productoId: papa._id.toString(), cantidad: '12', precio: '10' }],
        formaPago: 'FIADO',
      });

      const fila = (await informeDelDia(diaDeHoy())).ventas.porProducto[0]!;

      expect(fila.ventas).toHaveLength(2);
      expect(fila.ventas.map((v) => v.persona).sort()).toEqual(['MEMIN', 'Venta total']);

      const deMemin = fila.ventas.find((v) => v.persona === 'MEMIN')!;
      expect(deMemin.aDeber).toBe('120');
      expect(deMemin.deMostrador).toBe(false);

      const mostrador = fila.ventas.find((v) => v.deMostrador)!;
      expect(mostrador.aDeber).toBe('0');

      // Del producto salieron 200 y 120 quedaron a deber.
      expect(fila.vendido.USD).toBe('200');
      expect(fila.fiado.USD).toBe('120');
    });

    it('el informe lista las ventas y los abonos del día con nombre', async () => {
      const { papa, cliente } = await base();
      await crearOperacion({
        tipo: 'VENTA',
        personaId: cliente._id.toString(),
        moneda: 'USD',
        items: [{ productoId: papa._id.toString(), cantidad: '2', precio: '10' }],
        formaPago: 'FIADO',
      });
      await registrarPago({
        personaId: cliente._id.toString(),
        direccion: 'ENTRA',
        monto: '5',
        moneda: 'USD',
      });

      const informe = await informeDelDia(diaDeHoy());

      expect(informe.movimientos.ventas[0]!.persona).toBe('MEMIN');
      expect(informe.movimientos.ventas[0]!.aDeber).toBe('20');
      expect(informe.movimientos.abonos[0]!.persona).toBe('MEMIN');
      expect(informe.movimientos.abonos[0]!.monto).toBe('5');
    });

    it('el gasto enseña su equivalente con la tasa de su día', async () => {
      await base();
      await registrarGasto({
        categoria: 'OTROS',
        descripcion: 'Luisma',
        observacion: 'Le adelanté el flete',
        monto: '20',
        moneda: 'USD',
      });

      const gasto = (await informeDelDia(diaDeHoy())).salidas.gastos[0]!;
      expect(gasto.observacion).toBe('Le adelanté el flete');
      // 1 USD = 200 VES ese día.
      expect(gasto.eq.VES).toBe('4000');
    });

    /**
     * La regla de fondo: un reporte de ayer da los mismos números hoy, mañana
     * y siempre, aunque el dólar se haya movido tres veces desde entonces.
     */
    it('el equivalente de un gasto no cambia si mañana cambia la tasa', async () => {
      await base();
      const gasto = await registrarGasto({
        categoria: 'OTROS',
        descripcion: 'Luisma',
        monto: '20',
        moneda: 'USD',
      });
      const antes = (await informeDelDia(diaDeHoy())).salidas.gastos[0]!.eq.VES;

      limpiarCache();
      await registrarTasa({ usdCop: '4000', usdVes: '900', mercado: 'PARALELO', fuente: 'MANUAL' });

      const despues = (await informeDelDia(diaDeHoy())).salidas.gastos[0]!.eq.VES;
      expect(despues).toBe(antes);
      expect(despues).toBe('4000');
      void gasto;
    });

    it('al cerrar el día se clava la tasa y el reporte deja de moverse', async () => {
      await base();
      const cerrado = await guardarCierre({ dia: diaDeHoy(), sobrante: {}, observacion: '' });
      expect(cerrado.tasaFijada).toBe(true);
      expect(cerrado.tasa!.usdVes).toBe('200');

      limpiarCache();
      await registrarTasa({ usdCop: '4000', usdVes: '900', mercado: 'PARALELO', fuente: 'MANUAL' });

      const relectura = await informeDelDia(diaDeHoy());
      expect(relectura.tasa!.usdVes).toBe('200');
      expect(relectura.tasaFijada).toBe(true);
    });
  });

  describe('Quitar un gasto mal anotado', () => {
    it('devuelve la plata a la caja de donde salió', async () => {
      await base();
      const caja = await CajaModel.create({ nombre: 'Bolívares', moneda: 'VES', saldo: '500000' });

      const gasto = await registrarGasto({
        categoria: 'OTROS',
        descripcion: 'Luisma',
        monto: '80000',
        moneda: 'VES',
        cajaId: caja._id.toString(),
      });
      expect((await CajaModel.findById(caja._id))!.saldo).toBe('420000');

      await anularGasto(gasto._id.toString(), 'Me equivoqué');

      // Sin esto la caja se quedaba corta para siempre y el cierre del día
      // pedía contar menos billetes de los que había.
      expect((await CajaModel.findById(caja._id))!.saldo).toBe('500000');
    });

    it('desaparece del día y deja de restar del total', async () => {
      const { papa } = await base();
      await venderTotal({
        productoId: papa._id.toString(),
        cantidad: '10',
        precio: '10',
        moneda: 'USD',
      });
      const gasto = await registrarGasto({
        categoria: 'OTROS',
        descripcion: 'Luisma',
        monto: '15',
        moneda: 'USD',
      });

      expect((await informeDelDia(diaDeHoy())).deberiaQuedar.USD).toBe('85');

      await anularGasto(gasto._id.toString(), 'Me equivoqué');

      const informe = await informeDelDia(diaDeHoy());
      expect(informe.salidas.gastos).toHaveLength(0);
      expect(informe.salidas.gastado.USD).toBe('0');
      expect(informe.deberiaQuedar.USD).toBe('100');
    });

    it('no se puede quitar dos veces', async () => {
      await base();
      const caja = await CajaModel.create({ nombre: 'Dólares', moneda: 'USD', saldo: '100' });
      const gasto = await registrarGasto({
        categoria: 'OTROS',
        descripcion: 'Luisma',
        monto: '20',
        moneda: 'USD',
        cajaId: caja._id.toString(),
      });

      await anularGasto(gasto._id.toString(), 'Me equivoqué');
      await expect(anularGasto(gasto._id.toString(), 'Otra vez')).rejects.toThrow(/ya estaba/i);

      // Si dejara, la caja acabaría con plata que nunca existió.
      expect((await CajaModel.findById(caja._id))!.saldo).toBe('100');
    });
  });

  describe('El sobrante pasa al día siguiente', () => {
    it('lo contado ayer aparece hoy como saldo con el que se arranca', async () => {
      await base();
      const ayer = new Date(Date.now() - 24 * 3_600_000);

      await guardarCierre({
        dia: diaDeHoy(ayer),
        sobrante: { USD: '250', VES: '90000' },
        observacion: 'Quedaron 250 dólares en el cajón',
      });

      const informe = await informeDelDia(diaDeHoy());

      expect(informe.vieneDeAntes.dia).toBe(diaDeHoy(ayer));
      expect(informe.vieneDeAntes.sobrante.USD).toBe('250');
      expect(informe.vieneDeAntes.observacion).toMatch(/250 dólares/);
      // Sin movimientos hoy, lo que debería haber es justo lo que traía.
      expect(informe.deberiaQuedar.USD).toBe('250');
      expect(informe.deberiaQuedar.VES).toBe('90000');
    });

    /**
     * El caso que más duele: se hacen reportes día por medio. Si el saldo solo
     * viniera del último conteo escrito, el día sin cerrar quedaría fuera y el
     * "debería quedar" saldría mal justo cuando se va a contar la caja.
     */
    it('arrastra solo lo movido en los días que no se cerraron', async () => {
      const { papa } = await base();
      const anteayer = new Date(Date.now() - 2 * 24 * 3_600_000);
      const ayer = new Date(Date.now() - 24 * 3_600_000);

      await guardarCierre({ dia: diaDeHoy(anteayer), sobrante: { USD: '100' } });

      // Ayer se vendió y no se cerró.
      await venderTotal({
        productoId: papa._id.toString(),
        cantidad: '3',
        precio: '10',
        moneda: 'USD',
        fecha: ayer.toISOString(),
      });

      const informe = await informeDelDia(diaDeHoy());

      // 100 contados + 30 de ayer, sin que nadie escribiera nada anoche.
      expect(informe.vieneDeAntes.sobrante.USD).toBe('130');
      expect(informe.vieneDeAntes.desdeElConteo!.USD).toBe('30');
      expect(informe.deberiaQuedar.USD).toBe('130');
    });

    it('sin ningún conteo nunca, la cuenta viene sola desde el principio', async () => {
      const { papa } = await base();
      await venderTotal({
        productoId: papa._id.toString(),
        cantidad: '5',
        precio: '10',
        moneda: 'USD',
        fecha: new Date(Date.now() - 24 * 3_600_000).toISOString(),
      });

      const informe = await informeDelDia(diaDeHoy());
      expect(informe.vieneDeAntes.sinAncla).toBe(true);
      expect(informe.vieneDeAntes.sobrante.USD).toBe('50');
    });

    it('los gastos de días sin cerrar también se arrastran', async () => {
      await base();
      const ayer = new Date(Date.now() - 24 * 3_600_000);
      await guardarCierre({ dia: diaDeHoy(new Date(Date.now() - 2 * 24 * 3_600_000)), sobrante: { USD: '200' } });
      await registrarGasto({
        categoria: 'OTROS',
        descripcion: 'Luisma',
        monto: '35',
        moneda: 'USD',
        fecha: ayer.toISOString(),
      });

      expect((await informeDelDia(diaDeHoy())).vieneDeAntes.sobrante.USD).toBe('165');
    });

    it('se salta los días sin cierre en vez de arrancar en cero', async () => {
      await base();
      const haceTresDias = new Date(Date.now() - 3 * 24 * 3_600_000);

      await guardarCierre({ dia: diaDeHoy(haceTresDias), sobrante: { USD: '77' } });

      const informe = await informeDelDia(diaDeHoy());
      expect(informe.vieneDeAntes.dia).toBe(diaDeHoy(haceTresDias));
      expect(informe.vieneDeAntes.sobrante.USD).toBe('77');
    });

    it('enseña la diferencia entre lo contado y lo calculado, sin cuadrarla', async () => {
      const { papa } = await base();
      await venderTotal({
        productoId: papa._id.toString(),
        cantidad: '10',
        precio: '10',
        moneda: 'USD',
      });

      const informe = await guardarCierre({
        dia: diaDeHoy(),
        sobrante: { USD: '95' },
        observacion: 'Faltaron cinco dólares',
      });

      expect(informe.deberiaQuedar.USD).toBe('100');
      expect(informe.cierre!.sobrante.USD).toBe('95');
      expect(informe.cierre!.diferencia.USD).toBe('-5');
    });

    it('volver a cerrar el mismo día actualiza, no duplica', async () => {
      await base();
      await guardarCierre({ dia: diaDeHoy(), sobrante: { USD: '10' } });
      const informe = await guardarCierre({
        dia: diaDeHoy(),
        sobrante: { USD: '20' },
        observacion: 'Recontado',
      });

      expect(informe.cierre!.sobrante.USD).toBe('20');
      expect(informe.cierre!.observacion).toBe('Recontado');
    });
  });
});
