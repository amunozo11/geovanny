import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import mongoose from 'mongoose';
import { startTestMongo, stopTestMongo } from './mongo.js';

/**
 * Prueba de infraestructura, no de negocio: verifica que el entorno soporta
 * transacciones multi-documento ANTES de que existan las ventas.
 *
 * Si esto falla, nada de lo que viene después (venta = venta + inventario +
 * cartera, todo o nada) puede funcionar. Es preferible descubrirlo aquí.
 */
describe('Infraestructura: transacciones multi-documento', () => {
  beforeAll(async () => {
    await startTestMongo();
  }, 120_000);

  afterAll(async () => {
    await stopTestMongo();
  });

  it('la conexión es un replica set', async () => {
    const info = (await mongoose.connection.db?.admin().command({ hello: 1 })) as {
      setName?: string;
    };
    expect(info.setName).toBeTruthy();
  });

  it('confirma los dos documentos de una transacción exitosa', async () => {
    const ventas = mongoose.connection.collection('ventas_prueba');
    const movimientos = mongoose.connection.collection('movimientos_prueba');

    const session = await mongoose.startSession();
    await session.withTransaction(async () => {
      await ventas.insertOne({ numero: 'V-1', total: '700000' }, { session });
      await movimientos.insertOne({ producto: 'PAPA', delta: '-20' }, { session });
    });
    await session.endSession();

    expect(await ventas.countDocuments({ numero: 'V-1' })).toBe(1);
    expect(await movimientos.countDocuments({ producto: 'PAPA' })).toBe(1);
  });

  it('revierte TODO si un paso falla a mitad (INV-5 / T-28)', async () => {
    const ventas = mongoose.connection.collection('ventas_prueba');
    const movimientos = mongoose.connection.collection('movimientos_prueba');

    const session = await mongoose.startSession();
    await expect(
      session.withTransaction(async () => {
        await ventas.insertOne({ numero: 'V-2', total: '500000' }, { session });
        await movimientos.insertOne({ producto: 'CEBOLLA', delta: '-5' }, { session });
        throw new Error('fallo simulado tras escribir el inventario');
      }),
    ).rejects.toThrow('fallo simulado');
    await session.endSession();

    // Ni la venta ni el movimiento deben existir: no queda stock descontado
    // por una venta que nunca se registró.
    expect(await ventas.countDocuments({ numero: 'V-2' })).toBe(0);
    expect(await movimientos.countDocuments({ producto: 'CEBOLLA' })).toBe(0);
  });

  it('guarda y recupera Decimal128 sin perder precisión (RC-02)', async () => {
    const coleccion = mongoose.connection.collection('importes_prueba');
    const valor = mongoose.Types.Decimal128.fromString('906814.802000000001');

    await coleccion.insertOne({ tasa: valor });
    const guardado = await coleccion.findOne<{ tasa: mongoose.Types.Decimal128 }>({});

    expect(guardado?.tasa.toString()).toBe('906814.802000000001');
  });
});
