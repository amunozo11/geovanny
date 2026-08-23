import type { ChangeEvent } from 'react';

/**
 * Campo para escribir dinero, con los puntos de miles puestos al vuelo.
 *
 * `Bs. 1844000` y `Bs. 184400` se distinguen contando ceros con el dedo en la
 * pantalla; `1.844.000` y `184.400` se distinguen de un vistazo. Cuando lo que
 * se teclea son millones todos los días, eso deja de ser un adorno.
 *
 * Por dentro el valor sigue siendo el de siempre —`1844000`, con punto decimal—
 * que es lo que espera la API. Los puntos son solo lo que se ve.
 */

/**
 * De lo que se ve a lo que se guarda.
 *
 * La coma es SIEMPRE el decimal. El punto es separador de miles cuando va
 * seguido de exactamente tres cifras, y decimal cuando no: así `1.844.000` son
 * un millón ochocientos cuarenta y cuatro mil, y `10.50` siguen siendo diez con
 * cincuenta. Es la regla que hace que teclear a la colombiana y teclear a la
 * americana den los dos el número que la persona tenía en la cabeza.
 *
 * El único caso que queda ambiguo es `1.234`, que se lee como mil doscientos
 * treinta y cuatro. En un negocio donde los precios van en miles de bolívares,
 * esa es la lectura correcta prácticamente siempre.
 */
export function aCanonico(texto: string): string {
  // Los puntos de delante no son decimales de nada: vienen del símbolo pegado
  // ("Bs. 1.844.000") o de un dedo que se adelantó. Una coma de delante sí es
  // decimal: quien escribe ",5" quiere medio.
  const limpio = texto.replace(/[^\d.,]/g, '').replace(/^\.+/, '');
  if (limpio === '') return '';

  const conDecimal = (valor: string) => (valor.startsWith('.') ? `0${valor}` : valor);

  if (limpio.includes(',')) {
    const corte = limpio.lastIndexOf(',');
    const entero = limpio.slice(0, corte).replace(/[.,]/g, '');
    const decimales = limpio.slice(corte + 1).replace(/[.,]/g, '');
    return conDecimal(`${entero}.${decimales}`);
  }

  // Fuera los puntos que separan grupos de tres.
  const sinMiles = limpio.replace(/\.(?=\d{3}(?:\D|$))/g, '');

  // Si sobrevive más de un punto, solo el primero puede ser el decimal.
  const primero = sinMiles.indexOf('.');
  if (primero === -1) return sinMiles;
  return conDecimal(
    sinMiles.slice(0, primero + 1) + sinMiles.slice(primero + 1).replace(/\./g, ''),
  );
}

/** De lo que se guarda a lo que se ve: `1844000` → `1.844.000`. */
export function agrupar(canonico: string): string {
  if (canonico === '') return '';

  const corte = canonico.indexOf('.');
  const entero = corte === -1 ? canonico : canonico.slice(0, corte);
  const conPuntos = entero.replace(/\B(?=(\d{3})+(?!\d))/g, '.');

  return corte === -1 ? conPuntos : `${conPuntos},${canonico.slice(corte + 1)}`;
}

export function CampoDinero({
  etiqueta,
  valor,
  onChange,
  placeholder,
  autoFocus,
  className = '',
}: {
  etiqueta?: string;
  /** Valor canónico: `1844000.50`. Es lo que viaja a la API. */
  valor: string;
  onChange: (valor: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      {etiqueta && <span className="text-xs font-medium opacity-70">{etiqueta}</span>}
      <input
        type="text"
        // Teclado numérico en el celular, sin bloquear la coma decimal.
        inputMode="decimal"
        value={agrupar(valor)}
        placeholder={placeholder ? agrupar(placeholder) : undefined}
        autoFocus={autoFocus}
        onChange={(evento: ChangeEvent<HTMLInputElement>) =>
          onChange(aCanonico(evento.target.value))
        }
        className="tabular mt-1 w-full rounded-lg border border-slate-300 px-3 py-3 dark:border-slate-700 dark:bg-slate-800"
      />
    </label>
  );
}
