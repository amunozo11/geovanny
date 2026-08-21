/**
 * Plural en español para las unidades del negocio.
 *
 * bulto → bultos · caja → cajas · unidad → unidades
 *
 * Parece un detalle, pero una pantalla que dice "quedan 80 bulto" se lee como
 * un sistema a medio hacer, y esta app tiene que dar confianza con dinero.
 */
export function plural(palabra: string, cantidad: string | number): string {
  const texto = palabra.toLowerCase();
  const valor = Math.abs(Number(cantidad));
  if (valor === 1) return texto;
  return /[aeiouáéíóú]$/.test(texto) ? `${texto}s` : `${texto}es`;
}

/** "80 bultos", "1 caja", "0 unidades". */
export function conUnidad(cantidad: string | number, unidad: string): string {
  return `${cantidad} ${plural(unidad, cantidad)}`;
}
