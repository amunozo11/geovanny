import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { MONEDAS, type Moneda } from '@geovanny/shared';
import { MonedaContext, useMoneda } from './contexto';

export { useMoneda };

/**
 * Moneda en la que el usuario quiere VER todo.
 *
 * Solo afecta a la presentación: ningún dato guardado cambia (§19). Se recuerda
 * entre sesiones porque cada quien tiene su moneda de cabecera y no debería
 * tener que elegirla cada vez que abre la app.
 */
const CLAVE = 'geovanny:moneda';

export function MonedaProvider({ children }: { children: ReactNode }) {
  const [moneda, setMoneda] = useState<Moneda>(() => {
    const guardada = localStorage.getItem(CLAVE);
    return (MONEDAS as readonly string[]).includes(guardada ?? '') ? (guardada as Moneda) : 'COP';
  });

  useEffect(() => {
    localStorage.setItem(CLAVE, moneda);
  }, [moneda]);

  const valor = useMemo(() => ({ moneda, cambiar: setMoneda }), [moneda]);
  return <MonedaContext.Provider value={valor}>{children}</MonedaContext.Provider>;
}

/** Selector de moneda: tres botones, sin menús desplegables. */
export function SelectorMoneda() {
  const { moneda, cambiar } = useMoneda();

  return (
    <div
      role="group"
      aria-label="Ver todo en"
      className="flex rounded-lg bg-slate-200 p-0.5 dark:bg-slate-800"
    >
      {MONEDAS.map((codigo) => (
        <button
          key={codigo}
          type="button"
          onClick={() => cambiar(codigo)}
          aria-pressed={moneda === codigo}
          className={[
            'min-h-[36px] rounded-md px-3 text-sm font-semibold transition',
            moneda === codigo
              ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-950 dark:text-white'
              : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200',
          ].join(' ')}
        >
          {codigo}
        </button>
      ))}
    </div>
  );
}
