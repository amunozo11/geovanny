import { describe, expect, it } from 'vitest';
import { aCanonico, agrupar } from './CampoDinero';

describe('Escribir dinero con puntos de miles', () => {
  describe('Lo que se ve', () => {
    it('pone un punto cada tres cifras', () => {
      expect(agrupar('1844000')).toBe('1.844.000');
      expect(agrupar('251200')).toBe('251.200');
      expect(agrupar('635')).toBe('635');
      expect(agrupar('')).toBe('');
    });

    it('los decimales van con coma, como se leen en español', () => {
      expect(agrupar('1844000.5')).toBe('1.844.000,5');
      expect(agrupar('10.50')).toBe('10,50');
    });

    it('deja escribir la coma sin borrarla a mitad de camino', () => {
      expect(agrupar('10.')).toBe('10,');
    });
  });

  describe('Lo que se guarda', () => {
    it('quita los puntos de miles', () => {
      expect(aCanonico('1.844.000')).toBe('1844000');
      expect(aCanonico('251.200')).toBe('251200');
    });

    it('la coma siempre es el decimal', () => {
      expect(aCanonico('1.844.000,50')).toBe('1844000.50');
      expect(aCanonico('10,5')).toBe('10.5');
    });

    /**
     * El caso que importa: quien teclea a la americana escribe 10.50 pensando
     * en diez con cincuenta. Un punto seguido de dos cifras no puede ser un
     * separador de miles, así que se respeta como decimal.
     */
    it('un punto que no separa tres cifras es decimal', () => {
      expect(aCanonico('10.50')).toBe('10.50');
      expect(aCanonico('3099.31')).toBe('3099.31');
      expect(aCanonico('0.5')).toBe('0.5');
    });

    it('un punto seguido de tres cifras separa miles', () => {
      // Ambiguo en teoría; en este negocio los precios van en miles.
      expect(aCanonico('1.234')).toBe('1234');
    });

    it('ignora lo que no sea número, incluido el punto del símbolo', () => {
      expect(aCanonico('Bs. 1.844.000')).toBe('1844000');
      expect(aCanonico('US$ 635,00')).toBe('635.00');
      expect(aCanonico('abc')).toBe('');
      expect(aCanonico('')).toBe('');
    });

    it('una coma al principio sí es decimal: ",5" es medio', () => {
      expect(aCanonico(',5')).toBe('0.5');
    });

    it('sobrevive a un solo punto decimal aunque se teclee de más', () => {
      expect(aCanonico('10.5.3')).toBe('10.53');
    });
  });

  it('ida y vuelta: lo que se guarda se vuelve a ver igual', () => {
    for (const valor of ['0', '635', '251200', '1844000', '10.50', '1844000.5']) {
      expect(aCanonico(agrupar(valor))).toBe(valor);
    }
  });
});
