import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { clearTestMongo, startTestMongo, stopTestMongo } from '../test/mongo.js';
import { CajaModel, MovimientoCajaModel } from '../models/caja.js';
import { ProductoModel } from '../models/producto.js';
import { PersonaModel } from '../models/persona.js';
import { crearOperacion, anularOperacion } from './operaciones.service.js';
import { registrarPago } from './pagos.service.js';
import { limpiarCache, registrarTasa } from './tasas.service.js';
import { ajustar, crear, trasladar, verificar } from './cajas.service.js';
import { resumen } from './resumen.service.js';

async function base() {
  limpiarCache();
  await registrarTasa({
    usdCop: '3099.309008',
    usdVes: '896.224496',
    mercado: 'PARALELO',
    fuente: 'MANUAL',
  });

  const papa = await ProductoModel.create({ nombre: 'PAPA', unidad: 'BULTO', stock: '100' });
  const cliente = await PersonaModel.create({ nombre: 'MEMIN', tipo: 'CLIENTE' });
  const proveedor = await PersonaModel.create({ nombre: 'HIJINIO', tipo: 'PROVEEDOR' });
  return { papa, cliente, proveedor };
}

async function conCajas() {
  const datos = await base();
  const bolivares = await crear({ nombre: 'Efectivo bolívares', moneda: 'VES' });
  const pesos = await crear({ nombre: 'Efectivo pesos', moneda: 'COP' });
  const dolares = await crear({ nombre: 'Efectivo dólares', moneda: 'USD' });
  return { ...datos, bolivares: bolivares!, pesos: pesos!, dolares: dolares! };
}

const vender = (clienteId: string, productoId: string, forma: 'CONTADO' | 'FIADO') =>
  crearOperacion({
    tipo: 'VENTA',
    personaId: clienteId,
    moneda: 'VES',
    items: [{ productoId, cantidad: '10', precio: '1000' }],
    formaPago: forma,
  });

describe('Control de caja', () => {
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

  describe('Se activa solo si hay cajas', () => {
    it('sin cajas creadas, vender funciona igual y no rompe nada', async () => {
      const { papa, cliente } = await base();
      const venta = await vender(cliente._id.toString(), papa._id.toString(), 'CONTADO');

      expect(venta.numero).toBe('V-0001');
      expect(await MovimientoCajaModel.countDocuments()).toBe(0);
    });

    it('con cajas creadas, el dinero de una venta de contado entra solo', async () => {
      const { papa, cliente, bolivares } = await conCajas();
      await vender(cliente._id.toString(), papa._id.toString(), 'CONTADO');

      const caja = await CajaModel.findById(bolivares._id);
      expect(caja!.saldo).toBe('10000');

      const movimiento = await MovimientoCajaModel.findOne({ tipo: 'INGRESO' });
      expect(movimiento!.concepto).toContain('MEMIN');
      expect(movimiento!.saldoAntes).toBe('0');
      expect(movimiento!.saldoDespues).toBe('10000');
    });

    it('una venta fiada no mueve el dinero, porque no entró nada', async () => {
      const { papa, cliente, bolivares } = await conCajas();
      await vender(cliente._id.toString(), papa._id.toString(), 'FIADO');

      expect((await CajaModel.findById(bolivares._id))!.saldo).toBe('0');
    });
  });

  describe('El dinero entra y sale donde corresponde', () => {
    it('el abono entra en la caja de la moneda EN QUE PAGÓ, no la de la deuda', async () => {
      const { papa, cliente, bolivares, dolares } = await conCajas();
      await vender(cliente._id.toString(), papa._id.toString(), 'FIADO');

      // Debe 10.000 Bs y paga con 5 dólares
      await registrarPago({
        personaId: cliente._id.toString(),
        direccion: 'ENTRA',
        monto: '5',
        moneda: 'USD',
        aplicaA: 'VES',
      });

      expect((await CajaModel.findById(dolares._id))!.saldo).toBe('5');
      expect((await CajaModel.findById(bolivares._id))!.saldo).toBe('0');
    });

    it('pagarle a un proveedor saca el dinero de la caja', async () => {
      const { papa, proveedor, pesos } = await conCajas();
      await crearOperacion({
        tipo: 'COMPRA',
        personaId: proveedor._id.toString(),
        moneda: 'COP',
        items: [{ productoId: papa._id.toString(), cantidad: '10', precio: '100000' }],
        formaPago: 'FIADO',
      });

      await registrarPago({
        personaId: proveedor._id.toString(),
        direccion: 'SALE',
        monto: '400000',
        moneda: 'COP',
      });

      expect((await CajaModel.findById(pesos._id))!.saldo).toBe('-400000');
    });

    it('anular una venta de contado devuelve el dinero', async () => {
      const { papa, cliente, bolivares } = await conCajas();
      const venta = await vender(cliente._id.toString(), papa._id.toString(), 'CONTADO');
      expect((await CajaModel.findById(bolivares._id))!.saldo).toBe('10000');

      await anularOperacion(venta._id.toString(), 'Se equivocó de cliente');
      expect((await CajaModel.findById(bolivares._id))!.saldo).toBe('0');
    });
  });

  describe('Traslados entre cajas', () => {
    it('mover dinero entre dos cajas de la misma moneda', async () => {
      const { bolivares } = await conCajas();
      const otra = await crear({ nombre: 'Pago móvil', moneda: 'VES', tipo: 'MOVIL' });
      await ajustar({
        cajaId: bolivares._id.toString(),
        saldoReal: '100000',
        motivo: 'Conteo inicial',
      });

      await trasladar({
        origenId: bolivares._id.toString(),
        destinoId: otra!._id.toString(),
        monto: '30000',
      });

      expect((await CajaModel.findById(bolivares._id))!.saldo).toBe('70000');
      expect((await CajaModel.findById(otra!._id))!.saldo).toBe('30000');
    });

    it('cambiar bolívares por dólares es un traslado con tasa (§16)', async () => {
      const { bolivares, dolares } = await conCajas();
      await ajustar({
        cajaId: bolivares._id.toString(),
        saldoReal: '896224.50',
        motivo: 'Conteo inicial',
      });

      const traslado = await trasladar({
        origenId: bolivares._id.toString(),
        destinoId: dolares._id.toString(),
        monto: '896224.50',
      });

      // 896.224,50 Bs ÷ 896,224496 = 1.000 US$
      expect(traslado.recibido).toBe('1000');
      expect((await CajaModel.findById(dolares._id))!.saldo).toBe('1000');
      expect((await CajaModel.findById(bolivares._id))!.saldo).toBe('0');
    });

    it('admite una tasa pactada distinta a la del día', async () => {
      const { bolivares, dolares } = await conCajas();
      await ajustar({ cajaId: bolivares._id.toString(), saldoReal: '900000', motivo: 'Conteo' });

      const traslado = await trasladar({
        origenId: bolivares._id.toString(),
        destinoId: dolares._id.toString(),
        monto: '900000',
        montoDestino: '1000', // se cambió a 900 Bs por dólar
      });

      expect(traslado.recibido).toBe('1000');
      expect(traslado.tasaUsada).toBe('0.00111111');
    });

    it('no deja sacar más de lo que hay', async () => {
      const { bolivares, dolares } = await conCajas();
      await expect(
        trasladar({
          origenId: bolivares._id.toString(),
          destinoId: dolares._id.toString(),
          monto: '5000',
        }),
      ).rejects.toThrow(/solo hay 0/i);
    });
  });

  describe('Conteo y cuadre', () => {
    it('el ajuste se hace diciendo cuánto hay, no la diferencia', async () => {
      const { papa, cliente, bolivares } = await conCajas();
      await vender(cliente._id.toString(), papa._id.toString(), 'CONTADO');

      // Contó y hay 9.500 en vez de 10.000: faltan 500
      await ajustar({
        cajaId: bolivares._id.toString(),
        saldoReal: '9500',
        motivo: 'Faltó plata en el conteo del día',
      });

      const caja = await CajaModel.findById(bolivares._id);
      expect(caja!.saldo).toBe('9500');

      const ajuste = await MovimientoCajaModel.findOne({ tipo: 'AJUSTE' });
      expect(ajuste!.monto).toBe('-500');
      expect(ajuste!.concepto).toBe('Faltante en el conteo');
    });

    it('exige motivo en el ajuste', async () => {
      const { bolivares } = await conCajas();
      await expect(
        ajustar({ cajaId: bolivares._id.toString(), saldoReal: '100', motivo: '   ' }),
      ).rejects.toThrow(/motivo/i);
    });

    it('avisa si el conteo coincide, en vez de anotar un movimiento vacío', async () => {
      const { bolivares } = await conCajas();
      await expect(
        ajustar({ cajaId: bolivares._id.toString(), saldoReal: '0', motivo: 'Conteo' }),
      ).rejects.toThrow(/coincide/i);
    });

    it('el saldo guardado siempre cuadra con sus movimientos', async () => {
      const { papa, cliente, bolivares } = await conCajas();
      await vender(cliente._id.toString(), papa._id.toString(), 'CONTADO');
      await ajustar({ cajaId: bolivares._id.toString(), saldoReal: '9500', motivo: 'Conteo' });

      const revision = await verificar();
      expect(revision.todoCorrecto).toBe(true);
    });
  });

  describe('En el inicio', () => {
    it('responde "cuánto dinero tengo" en la moneda elegida', async () => {
      const { papa, cliente, dolares } = await conCajas();
      await vender(cliente._id.toString(), papa._id.toString(), 'CONTADO'); // 10.000 Bs
      await ajustar({ cajaId: dolares._id.toString(), saldoReal: '100', motivo: 'Conteo' });

      const enVes = await resumen('VES');
      if (enVes.sinTasa) throw new Error('debía haber tasa');

      // 10.000 Bs + 100 US$ (= 89.622,45 Bs) = 99.622,45 Bs
      expect(enVes.dinero.total).toBe('99622.45');
      expect(enVes.dinero.cajas).toHaveLength(3);

      const enUsd = await resumen('USD');
      if (enUsd.sinTasa) throw new Error('debía haber tasa');
      expect(enUsd.dinero.total).toBe('111.16');
    });
  });
});
