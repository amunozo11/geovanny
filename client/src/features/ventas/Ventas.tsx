import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { D, cantidadTexto, formatMoney, money } from '@geovanny/shared';
import { api } from '../../lib/api';
import { Aviso, Campo, Cargando, Tarjeta, Vacio } from '../../components/ui/base';
import { etiquetaDia } from '../../components/ui/CampoFecha';
import type { Operacion } from '../../lib/tipos';

/**
 * Todas las ventas, de la más reciente a la más vieja.
 *
 * Agrupadas por día, porque así es como se busca una venta: "la del martes",
 * no "la número 47". Cada una se abre y se ve entera.
 */

const dia = (iso: string) => iso.slice(0, 10);

export function Ventas() {
  const [soloPendientes, setSoloPendientes] = useState(false);
  const [busqueda, setBusqueda] = useState('');

  const consulta = useQuery({
    queryKey: ['ventas', soloPendientes],
    queryFn: () =>
      api<Operacion[]>(
        `/operaciones?tipo=VENTA&limite=200${soloPendientes ? '&pendientes=true' : ''}`,
      ),
  });

  if (consulta.isLoading) return <Cargando />;
  if (consulta.isError) return <Aviso tono="error">No se pudieron cargar las ventas.</Aviso>;

  const filtro = busqueda.trim().toLowerCase();
  const ventas = (consulta.data ?? []).filter(
    (v) =>
      !filtro ||
      v.personaNombre.toLowerCase().includes(filtro) ||
      v.numero.toLowerCase().includes(filtro) ||
      v.items.some((i) => i.nombre.toLowerCase().includes(filtro)),
  );

  // Un bloque por día, en el orden en que vienen (ya ordenadas por fecha).
  const porDia: { dia: string; ventas: Operacion[] }[] = [];
  for (const venta of ventas) {
    const clave = dia(venta.fecha);
    const ultimo = porDia[porDia.length - 1];
    if (ultimo?.dia === clave) ultimo.ventas.push(venta);
    else porDia.push({ dia: clave, ventas: [venta] });
  }

  return (
    <div className="space-y-4">
      <div>
        <Link to="/" className="text-sm opacity-60">
          ← Inicio
        </Link>
        <h1 className="text-xl font-bold">Todas las ventas</h1>
      </div>

      <Campo
        valor={busqueda}
        onChange={setBusqueda}
        placeholder="Buscar por cliente, número o producto…"
      />

      <div className="grid grid-cols-2 gap-2">
        {[
          [false, 'Todas'],
          [true, 'Solo las que deben'],
        ].map(([valor, texto]) => (
          <button
            key={String(valor)}
            type="button"
            onClick={() => setSoloPendientes(valor as boolean)}
            aria-pressed={soloPendientes === valor}
            className={[
              'min-h-[44px] rounded-lg border text-sm font-semibold',
              soloPendientes === valor
                ? 'border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-900'
                : 'border-slate-300 dark:border-slate-700',
            ].join(' ')}
          >
            {texto}
          </button>
        ))}
      </div>

      {ventas.length === 0 ? (
        <Vacio mensaje={filtro ? `Ninguna venta coincide con "${busqueda}".` : 'No hay ventas.'} />
      ) : (
        porDia.map((bloque) => (
          <Tarjeta
            key={bloque.dia}
            titulo={`${etiquetaDia(bloque.dia)} · ${bloque.dia} · ${bloque.ventas.length}`}
          >
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {bloque.ventas.map((venta) => (
                <li key={venta.id}>
                  <Link
                    to={`/ventas/${venta.id}`}
                    className="flex items-start justify-between gap-3 py-3"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{venta.personaNombre}</span>
                      <span className="block truncate text-xs opacity-60">
                        {venta.items
                          .map((i) => `${cantidadTexto(i.cantidad)} ${i.nombre.toLowerCase()}`)
                          .join(' · ')}
                      </span>
                      <span className="text-xs opacity-40">{venta.numero}</span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="tabular block font-semibold">
                        {formatMoney(money(venta.total.monto, venta.moneda))}
                      </span>
                      {D(venta.saldo).greaterThan(0) ? (
                        <span className="tabular block text-xs text-amber-600 dark:text-amber-400">
                          debe {formatMoney(money(venta.saldo, venta.moneda))}
                        </span>
                      ) : (
                        <span className="block text-xs text-emerald-600 dark:text-emerald-400">
                          pagada
                        </span>
                      )}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </Tarjeta>
        ))
      )}
    </div>
  );
}
