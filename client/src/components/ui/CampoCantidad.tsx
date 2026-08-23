import type { ChangeEvent } from 'react';
import { D, cantidadTexto, conUnidad } from '@geovanny/shared';

/**
 * Campo para escribir cuánto salió, con el medio a un toque.
 *
 * Partir un bulto es cosa de todos los días, y teclear `0.5` en el teclado del
 * celular —buscando el punto, acordándose de que no es coma— es justo el tipo
 * de fricción que hace que alguien apunte "1" y siga. El botón **½** lo pone y
 * lo quita sobre lo que ya haya escrito: vacío → medio, `2` → dos y medio,
 * `2½` → dos otra vez.
 *
 * Debajo se lee en cristiano lo que se va a guardar ("2½ bultos"), porque el
 * número de arriba y lo que la persona tiene en la cabeza tienen que coincidir
 * antes de tocar guardar.
 */

/** Lo que se teclea → lo que se guarda. La coma vale como decimal. */
export function aCantidad(texto: string): string {
  const limpio = texto.replace(/[^\d.,]/g, '').replace(/,/g, '.');
  const punto = limpio.indexOf('.');
  if (punto === -1) return limpio;
  // Un solo punto decimal, aunque el dedo lo pulse dos veces.
  return limpio.slice(0, punto + 1) + limpio.slice(punto + 1).replace(/\./g, '');
}

/** Pone o quita el medio sobre lo que ya haya escrito. */
export function alternarMedio(valor: string): string {
  if (valor === '' || valor === '.') return '0.5';

  const numero = D(valor || '0');
  const entero = numero.floor();
  const tieneMedio = numero.minus(entero).toDecimalPlaces(4).equals('0.5');

  if (tieneMedio) return entero.isZero() ? '' : entero.toString();
  return entero.plus('0.5').toString();
}

export function CampoCantidad({
  etiqueta,
  valor,
  onChange,
  unidad,
  autoFocus,
  className = '',
}: {
  etiqueta?: string;
  /** Valor canónico: `2.5`. Es lo que viaja a la API. */
  valor: string;
  onChange: (valor: string) => void;
  /** Para leer debajo "2½ bultos". Si no se pasa, solo se muestra el número. */
  unidad?: string;
  autoFocus?: boolean;
  className?: string;
}) {
  const hayAlgo = valor !== '' && valor !== '.';
  const conMedio = hayAlgo && D(valor).minus(D(valor).floor()).toDecimalPlaces(4).equals('0.5');

  return (
    <div className={className}>
      <label className="block">
        {etiqueta && <span className="text-xs font-medium opacity-70">{etiqueta}</span>}
        <div className="mt-1 flex gap-2">
          <input
            type="text"
            inputMode="decimal"
            value={valor}
            autoFocus={autoFocus}
            onChange={(evento: ChangeEvent<HTMLInputElement>) =>
              onChange(aCantidad(evento.target.value))
            }
            className="tabular min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-3 dark:border-slate-700 dark:bg-slate-800"
          />
          <button
            type="button"
            onClick={() => onChange(alternarMedio(valor))}
            aria-pressed={conMedio}
            aria-label="Medio"
            className={[
              'w-14 shrink-0 rounded-lg border text-lg font-semibold',
              conMedio
                ? 'border-brand-600 bg-brand-600 text-white'
                : 'border-slate-300 dark:border-slate-700',
            ].join(' ')}
          >
            ½
          </button>
        </div>
      </label>

      {hayAlgo && (
        <p className="tabular mt-1 text-xs opacity-60">
          {unidad ? conUnidad(valor, unidad) : cantidadTexto(valor)}
        </p>
      )}
    </div>
  );
}
