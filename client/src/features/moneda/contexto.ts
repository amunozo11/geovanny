import { createContext, useContext } from 'react';
import type { Moneda } from '@geovanny/shared';

/**
 * El contexto vive en su propio archivo, sin componentes.
 *
 * Si estuviera junto al proveedor, la recarga en caliente de Vite crearía un
 * contexto nuevo al editar ese archivo mientras el proveedor sigue usando el
 * viejo, y la pantalla se caería con "useMoneda debe usarse dentro de
 * MonedaProvider". Separarlo lo evita.
 */
export interface EstadoMoneda {
  moneda: Moneda;
  cambiar: (moneda: Moneda) => void;
}

export const MonedaContext = createContext<EstadoMoneda | null>(null);

export function useMoneda(): EstadoMoneda {
  const contexto = useContext(MonedaContext);
  if (!contexto) throw new Error('useMoneda debe usarse dentro de <MonedaProvider>');
  return contexto;
}
