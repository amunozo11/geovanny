import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { clearTestMongo, startTestMongo, stopTestMongo } from '../test/mongo.js';
import { ProductoModel } from '../models/producto.js';
import { PersonaModel } from '../models/persona.js';
import { CajaModel } from '../models/caja.js';
import { CargoModel } from '../models/cargo.js';
import { PagoModel } from '../models/pago.js';
import { GastoModel } from '../models/gasto.js';
import { limpiarCache, registrarTasa } from './tasas.service.js';
import { crearOperacion } from './operaciones.service.js';
import { registrar as venderTotal } from './ventasTotales.service.js';
import { registrarCargo, anularCargo, corregirCargo } from './cargos.service.js';
import { registrarPago, anularPago, corregirPago } from './pagos.service.js';
import { guardarCierre, informeDelDia } from './todo.service.js';
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
