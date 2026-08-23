import type { ChangeEvent } from 'react';
import { defaultCurrencyRegistry, formatMoney, money, type Moneda } from '@geovanny/shared';

/**
 * Campo para escribir dinero, con los puntos de miles puestos al vuelo.
 *
 * `1844000` y `184400` se distinguen contando ceros con el dedo; `1.844.000` y
 * `184.400` se distinguen de un vistazo. Cuando lo que se teclea son millones
 * todos los días, eso deja de ser un adorno.
 *
 * **La coma es el decimal y el punto es el separador de miles. Siempre.** Es la
 * misma convención con la que se muestran las cifras en toda la aplicación
 * (`1.844.000,50`), así que lo que se teclea y lo que se lee coinciden.
 *
 * Antes se intentaba adivinar: un punto seguido de dos cifras se tomaba como
 * decimal, uno seguido de tres como miles. Sobre un número ya escrito acertaba,
 * pero **mientras se teclea no hay número completo que mirar**: al escribir
 * `1.844.000`, en el momento del primer punto solo existe `1.`, y se
 * interpretaba como decimal. A partir de ahí todo lo demás caía detrás de la
 * coma y `1.844.000` acababa valiendo `1,844`. Adivinar salía caro; la regla
 * fija no falla.
 *
 * Por dentro el valor sigue siendo el de siempre —`1844000.50`, con punto
 * decimal— que es lo que espera la API.
 */

/** Lo que se teclea → lo que se guarda. */
export function aCanonico(texto: string, decimales = 2): string {
  // Fuera todo lo que no sea cifra o coma: los puntos son separadores de miles
  // y no aportan nada al valor.
  const limpio = texto.replace(/[^\d,]/g, '');
  if (limpio === '') return '';

  // En una moneda sin céntimos (el peso) la coma no significa nada.
  if (decimales === 0) return limpio.replace(/,/g, '');

  const corte = limpio.indexOf(',');
  if (corte === -1) return limpio;

  const entero = limpio.slice(0, corte);
  const decimal = limpio.slice(corte + 1).replace(/,/g, '').slice(0, decimales);
  return `${entero === '' ? '0' : entero}.${decimal}`;
}

/** De lo que se guarda a lo que se ve: `1844000.5` → `1.844.000,5`. */
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
  moneda,
  placeholder,
  autoFocus,
  className = '',
}: {
  etiqueta?: string;
  /** Valor canónico: `1844000.50`. Es lo que viaja a la API. */
  valor: string;
  onChange: (valor: string) => void;
  /**
   * La moneda decide si hay céntimos y permite leer debajo la cifra completa.
   * Ese eco es la red: quien teclee `12.50` por costumbre ve al instante
   * `US$ 1.250,00` y lo corrige antes de guardar.
   */
  moneda?: Moneda;
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
}) {
  const decimales = moneda ? defaultCurrencyRegistry.decimalsFor(moneda) : 2;
  const hayAlgo = valor !== '' && valor !== '.';

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
          onChange(aCanonico(evento.target.value, decimales))
        }
        className="tabular mt-1 w-full rounded-lg border border-slate-300 px-3 py-3 dark:border-slate-700 dark:bg-slate-800"
      />
      {moneda && hayAlgo && (
        <span className="tabular mt-1 block text-xs opacity-60">
          {formatMoney(money(valor, moneda))}
        </span>
      )}
    </label>
  );
}
