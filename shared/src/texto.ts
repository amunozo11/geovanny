import { D } from './money/decimal.js';

/** Un punto cada tres cifras: `1500` → `1.500`. */
function conMiles(entero: string): string {
  return entero.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** Las fracciones que de verdad se usan al despachar. */
const FRACCIONES: Record<string, string> = {
  '0.25': '¼',
  '0.5': '½',
  '0.75': '¾',
};

/**
 * Una cantidad como se dice, no como la guarda la máquina.
 *
 * Medio bulto es medio bulto: ni uno ni cero. El negocio parte sacos y cajas
 * todos los días, así que `0.5` tiene que verse como `½` y no como un decimal
 * que hay que interpretar — y desde luego no redondeado a 1, que sería vender
 * el doble en el papel de lo que salió del almacén.
 *
 * Lo que no cae en una fracción conocida se escribe con coma, como se lee en
 * español, y con los puntos de miles puestos.
 */
export function cantidadTexto(cantidad: string | number): string {
  const valor = D(cantidad);
  const signo = valor.isNegative() ? '−' : '';
  const abs = valor.abs();

  const entero = abs.floor();
  const resto = abs.minus(entero).toDecimalPlaces(4).toString();
  const glifo = FRACCIONES[resto];

  if (glifo) {
    return entero.isZero() ? `${signo}${glifo}` : `${signo}${conMiles(entero.toString())}${glifo}`;
  }

  const texto = abs.toString();
  const punto = texto.indexOf('.');
  if (punto === -1) return `${signo}${conMiles(texto)}`;

  return `${signo}${conMiles(texto.slice(0, punto))},${texto.slice(punto + 1)}`;
}

/**
 * Plural en español para las unidades del negocio.
 *
 * bulto → bultos · caja → cajas · unidad → unidades
 *
 * Parece un detalle, pero una pantalla que dice "quedan 80 bulto" se lee como
 * un sistema a medio hacer, y esta app tiene que dar confianza con dinero.
 *
 * "1 bulto" y "½ bulto" van en singular —medio bulto, no medio bultos—; "1½
 * bultos" y "0,25 bultos", en plural.
 */
export function plural(palabra: string, cantidad: string | number): string {
  const texto = palabra.toLowerCase();
  const valor = D(cantidad).abs();
  if (valor.equals(1) || valor.equals('0.5')) return texto;
  return /[aeiouáéíóú]$/.test(texto) ? `${texto}s` : `${texto}es`;
}

/** "80 bultos", "1 caja", "½ bulto", "2½ sacos", "0 unidades". */
export function conUnidad(cantidad: string | number, unidad: string): string {
  return `${cantidadTexto(cantidad)} ${plural(unidad, cantidad)}`;
}
