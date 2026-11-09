import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { D, cantidadTexto, conUnidad } from '@geovanny/shared';
import { api } from '../../lib/api';
import { Aviso, Cargando, Tarjeta, Vacio } from '../../components/ui/base';
import { TiraDeDias, etiquetaDia, hoy } from '../../components/ui/CampoFecha';
import type { ExistenciasDelDia } from '../../lib/tipos';

/**
 * Con cuánto se arrancó el día, qué se movió y cómo quedó.
 *
 * Responde la pregunta que el cuaderno no puede: *"¿cuánto tenía ayer y con
 * cuánto arranco hoy?"*. Y sobre todo deja ver si lo que falta se explica con
 * lo que salió o si hay un hueco — que es el momento de contar y corregir.
 *
 * No hay ninguna foto diaria guardada: se reconstruye desde el stock de ahora
 * deshaciendo los movimientos posteriores. Una foto se desincroniza en cuanto
 * alguien corrige algo viejo; esto siempre cuadra con lo que se ve.
 */
export function Existencias() {
  const [dia, setDia] = useState(hoy());
  const [abierto, setAbierto] = useState<string | null>(null);

  const consulta = useQuery({
    queryKey: ['existencias', dia],
    queryFn: () => api<ExistenciasDelDia>(`/productos/existencias?dia=${dia}`),
  });

  if (consulta.isLoading) return <Cargando />;
  if (consulta.isError || !consulta.data) {
    return <Aviso tono="error">No se pudieron cargar las existencias.</Aviso>;
  }

  const { productos, esHoy } = consulta.data;

  return (
    <div className="space-y-4">
      <div>
        <Link to="/inventario" className="text-sm opacity-60">
          ← Inventario
        </Link>
        <h1 className="text-xl font-bold">Existencias por día</h1>
        <p className="text-xs opacity-60">
          Con cuánto arrancaste, qué entró, qué salió y cómo quedó.
        </p>
      </div>

      <Tarjeta titulo="Qué día">
        <TiraDeDias valor={dia} onChange={setDia} />
      </Tarjeta>

      {productos.length === 0 ? (
        <Vacio mensaje={`No hubo existencias ni movimientos el ${dia}.`} />
      ) : (
        <Tarjeta titulo={`${etiquetaDia(dia)} · ${productos.length} productos`}>
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {productos.map((fila) => {
              const sinMovimiento = fila.movimientos.length === 0;
              // Solo puede descuadrar en días pasados si alguien corrigió algo
              // después; hoy, lo calculado y el stock tienen que coincidir.
              const descuadra = esHoy && !D(fila.final).equals(D(fila.actual));

              return (
                <li key={fila.id}>
                  <button
                    type="button"
                    onClick={() => setAbierto((v) => (v === fila.id ? null : fila.id))}
                    disabled={sinMovimiento}
                    aria-expanded={abierto === fila.id}
                    className="flex w-full items-start justify-between gap-3 py-2.5 text-left disabled:cursor-default"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold">
                        {fila.nombre}
                        {!sinMovimiento && (
                          <span className="ml-1 text-xs font-normal opacity-40">
                            {abierto === fila.id ? '▾' : '▸'}
                          </span>
                        )}
                      </span>
                      <span className="tabular text-xs opacity-60">
                        Arrancó con {conUnidad(fila.inicial, fila.unidad)}
                      </span>
                      <span className="tabular block text-xs">
                        {D(fila.entro).greaterThan(0) && (
                          <span className="text-emerald-600 dark:text-emerald-400">
                            + {cantidadTexto(fila.entro)} entró
                          </span>
                        )}
                        {D(fila.entro).greaterThan(0) && D(fila.salio).greaterThan(0) && ' · '}
                        {D(fila.salio).greaterThan(0) && (
                          <span className="text-amber-600 dark:text-amber-400">
                            − {cantidadTexto(fila.salio)} salió
                          </span>
                        )}
                        {sinMovimiento && <span className="opacity-40">sin movimientos</span>}
                      </span>
                    </span>

                    <span className="shrink-0 text-right">
                      <span className="tabular block text-xl font-bold">
                        {cantidadTexto(fila.final)}
                      </span>
                      <span className="block text-xs opacity-60">
                        {esHoy ? 'hay ahora' : 'quedó'}
                      </span>
                      {descuadra && (
                        <span className="tabular block text-xs text-rose-600 dark:text-rose-400">
                          el inventario dice {cantidadTexto(fila.actual)}
                        </span>
                      )}
                    </span>
                  </button>

                  {abierto === fila.id && (
                    <ul className="mb-2 space-y-1 rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-800/50">
                      {fila.movimientos.map((m) => (
                        <li key={m.id} className="flex items-baseline justify-between gap-2 text-xs">
                          <span className="min-w-0">
                            <span className="font-medium">{m.tipo.toLowerCase()}</span>
                            {m.refNumero && <span className="ml-1 opacity-50">{m.refNumero}</span>}
                            {m.motivo && <span className="block opacity-60">{m.motivo}</span>}
                          </span>
                          <span
                            className={`tabular shrink-0 font-semibold ${
                              D(m.cantidad).isNegative()
                                ? 'text-amber-600 dark:text-amber-400'
                                : 'text-emerald-600 dark:text-emerald-400'
                            }`}
                          >
                            {D(m.cantidad).greaterThan(0) ? '+' : ''}
                            {cantidadTexto(m.cantidad)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>

          <p className="mt-3 text-xs opacity-50">
            Si lo que hay no cuadra con lo que debería, cuéntalo y corrígelo desde Inventario →
            Cantidad. Queda escrito qué pasó, sin borrar nada.
          </p>
        </Tarjeta>
      )}
    </div>
  );
}
