import { describe, expect, it } from 'vitest';
import { cantidadTexto, conUnidad, plural } from './texto.js';

describe('Cantidades como se dicen', () => {
  it('los enteros llevan sus puntos de miles', () => {
    expect(cantidadTexto('2')).toBe('2');
    expect(cantidadTexto('80')).toBe('80');
    expect(cantidadTexto('1500')).toBe('1.500');
    expect(cantidadTexto('0')).toBe('0');
  });

  /**
   * El caso que importa: se parte un bulto y sale medio. Ni uno ni cero —
   * redondear ahí sería vender en el papel el doble de lo que salió del
   * almacén.
   */
  it('media unidad es media, no una', () => {
    expect(cantidadTexto('0.5')).toBe('½');
    expect(cantidadTexto('1.5')).toBe('1½');
    expect(cantidadTexto('12.5')).toBe('12½');
    expect(cantidadTexto('1500.5')).toBe('1.500½');
  });

  it('también los cuartos, que es como se parte una caja', () => {
    expect(cantidadTexto('0.25')).toBe('¼');
    expect(cantidadTexto('2.75')).toBe('2¾');
  });

  it('lo que no cae en una fracción conocida se escribe con coma', () => {
    expect(cantidadTexto('0.3')).toBe('0,3');
    expect(cantidadTexto('1500.125')).toBe('1.500,125');
  });

  it('las salidas negativas del kardex se leen igual', () => {
    expect(cantidadTexto('-0.5')).toBe('−½');
    expect(cantidadTexto('-13')).toBe('−13');
  });
});

describe('Plural de las unidades', () => {
  it('uno y medio van en singular', () => {
    expect(plural('BULTO', '1')).toBe('bulto');
    expect(plural('BULTO', '0.5')).toBe('bulto');
  });

  it('todo lo demás en plural', () => {
    expect(plural('BULTO', '0')).toBe('bultos');
    expect(plural('CAJA', '2')).toBe('cajas');
    expect(plural('UNIDAD', '3')).toBe('unidades');
    expect(plural('BULTO', '1.5')).toBe('bultos');
    expect(plural('SACO', '-2')).toBe('sacos');
  });
});

describe('Cantidad con su unidad', () => {
  it('junta las dos reglas', () => {
    expect(conUnidad('80', 'BULTO')).toBe('80 bultos');
    expect(conUnidad('1', 'BULTO')).toBe('1 bulto');
    expect(conUnidad('0.5', 'BULTO')).toBe('½ bulto');
    expect(conUnidad('1.5', 'BULTO')).toBe('1½ bultos');
    expect(conUnidad('0', 'CAJA')).toBe('0 cajas');
    expect(conUnidad('1250', 'UNIDAD')).toBe('1.250 unidades');
  });
});
