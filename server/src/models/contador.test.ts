import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { clearTestMongo, startTestMongo, stopTestMongo } from '../test/mongo.js';
import { ContadorModel, secuenciaDe, sincronizarContador, siguienteNumero } from './contador.js';

describe('Numeración correlativa', () => {
  beforeAll(async () => {
    await startTestMongo();
  }, 120_000);

  afterAll(async () => {
    await stopTestMongo();
  });

  beforeEach(async () => {
    await clearTestMongo();
  });

  it('reparte números consecutivos', async () => {
    expect(await siguienteNumero('V')).toBe('V-0001');
    expect(await siguienteNumero('V')).toBe('V-0002');
    // Cada prefijo lleva su propia cuenta.
    expect(await siguienteNumero('D')).toBe('D-0001');
  });

  /**
   * El fallo que se llevó la aplicación por delante: la clave del contador
   * llevaba el año (`V:2026`) pero el número escrito no (`V-0001`), y el índice
   * de `numero` es único para siempre. El 1 de enero el contador habría vuelto
   * a empezar y la primera venta del año habría chocado con la del año pasado.
   */
  it('la cuenta no se reinicia al cambiar de año', async () => {
    await siguienteNumero('V');
    const contadores = await ContadorModel.find();

    expect(contadores).toHaveLength(1);
    expect(contadores[0]!._id).toBe('V');
    expect(String(contadores[0]!._id)).not.toMatch(/\d{4}/);
  });

  describe('Sincronizar con lo que ya existe', () => {
    it('sube el contador por encima del número más alto', async () => {
      // El contador se quedó atrás: una importación por fuera, una copia
      // restaurada. Sin esto, la siguiente venta chocaría con D-0002.
      await ContadorModel.create({ _id: 'D', seq: 1 });

      const mayor = await sincronizarContador('D', ['D-0001', 'D-0066', 'D-0012']);

      expect(mayor).toBe(66);
      expect(await siguienteNumero('D')).toBe('D-0067');
    });

    it('nunca baja el contador', async () => {
      await ContadorModel.create({ _id: 'V', seq: 90 });
      await sincronizarContador('V', ['V-0003']);

      expect(await siguienteNumero('V')).toBe('V-0091');
    });

    it('sin documentos no toca nada', async () => {
      expect(await sincronizarContador('G', [])).toBe(0);
      expect(await siguienteNumero('G')).toBe('G-0001');
    });
  });

  it('lee la secuencia de un número', () => {
    expect(secuenciaDe('D-0066')).toBe(66);
    expect(secuenciaDe('V-0001')).toBe(1);
    expect(secuenciaDe(null)).toBe(0);
    expect(secuenciaDe('raro')).toBe(0);
  });
});
