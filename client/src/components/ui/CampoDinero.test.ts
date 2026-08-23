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
  });

  /**
   * Lo que rompía antes: al teclear `1.844.000`, en el momento del primer punto
   * solo existe `1.`, y se tomaba como decimal. Todo lo demás caía detrás de la
   * coma y la cifra acababa valiendo `1,844`.
   */
  describe('Tecleando de izquierda a derecha', () => {
    const tecleando = (texto: string, decimales = 2) =>
      texto.split('').reduce((valor, letra) => aCanonico(agrupar(valor) + letra, decimales), '');

    it('un millón ochocientos cuarenta y cuatro mil, con sus puntos', () => {
      expect(tecleando('1.844.000')).toBe('1844000');
    });

    it('y sin ellos', () => {
      expect(tecleando('1844000')).toBe('1844000');
    });

    it('doce con cincuenta, con la coma', () => {
      expect(tecleando('12,50')).toBe('12.50');
    });

    it('un peso no tiene céntimos: la coma no hace nada', () => {
      expect(tecleando('7.816.547', 0)).toBe('7816547');
      expect(tecleando('100,50', 0)).toBe('10050');
    });
  });

  describe('Lo que se guarda', () => {
    it('el punto es siempre separador de miles', () => {
      expect(aCanonico('1.844.000')).toBe('1844000');
      expect(aCanonico('251.200')).toBe('251200');
      // Quien teclee 12.50 por costumbre obtiene 1250, y el eco de debajo se lo
      // enseña como US$ 1.250,00 antes de guardar.
      expect(aCanonico('12.50')).toBe('1250');
    });

    it('la coma es siempre el decimal', () => {
      expect(aCanonico('1.844.000,50')).toBe('1844000.50');
      expect(aCanonico('10,5')).toBe('10.5');
      expect(aCanonico(',5')).toBe('0.5');
    });

    it('no deja más decimales de los que tiene la moneda', () => {
      expect(aCanonico('10,567')).toBe('10.56');
      expect(aCanonico('10,5', 0)).toBe('105');
    });

    it('ignora el símbolo y lo que no sea número', () => {
      expect(aCanonico('Bs. 1.844.000')).toBe('1844000');
      expect(aCanonico('US$ 635,00')).toBe('635.00');
      expect(aCanonico('abc')).toBe('');
      expect(aCanonico('')).toBe('');
    });

    it('una sola coma, aunque el dedo la pulse dos veces', () => {
      expect(aCanonico('10,5,3')).toBe('10.53');
    });
  });

  it('ida y vuelta: lo que se guarda se vuelve a ver igual', () => {
    for (const valor of ['0', '635', '251200', '1844000', '10.50', '1844000.5']) {
      expect(aCanonico(agrupar(valor))).toBe(valor);
    }
  });
});
