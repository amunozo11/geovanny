import { describe, expect, it } from 'vitest';
import { aCantidad, alternarMedio } from './CampoCantidad';

describe('Escribir cantidades', () => {
  it('la coma vale como decimal, que es como se teclea aquí', () => {
    expect(aCantidad('2,5')).toBe('2.5');
    expect(aCantidad('2.5')).toBe('2.5');
    expect(aCantidad('12')).toBe('12');
  });

  it('ignora lo que no sea número y admite un solo decimal', () => {
    expect(aCantidad('2 bultos')).toBe('2');
    expect(aCantidad('2.5.3')).toBe('2.53');
    expect(aCantidad('')).toBe('');
  });

  it('deja el punto a medio escribir sin borrarlo', () => {
    expect(aCantidad('2.')).toBe('2.');
  });
});

describe('El botón de medio', () => {
  it('sobre vacío pone medio', () => {
    expect(alternarMedio('')).toBe('0.5');
  });

  it('sobre un entero lo convierte en "y medio"', () => {
    expect(alternarMedio('2')).toBe('2.5');
    expect(alternarMedio('0')).toBe('0.5');
  });

  it('vuelve a pulsarlo y quita el medio', () => {
    expect(alternarMedio('2.5')).toBe('2');
    expect(alternarMedio('0.5')).toBe('');
  });

  it('sobre otro decimal se queda con el entero y medio', () => {
    expect(alternarMedio('2.25')).toBe('2.5');
  });
});
