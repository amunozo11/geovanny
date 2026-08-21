import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { D, MONEDAS, formatMoney, money } from '@geovanny/shared';
import { api } from '../../lib/api';
import { Campo, Cargando, Tarjeta, Vacio } from '../../components/ui/base';
import type { Persona } from '../../lib/tipos';

/** Punto verde/ámbar según deba o no (§23), con el texto al lado por si no se distingue el color. */
function Semaforo({ debe }: { debe: boolean }) {
  return (
    <span
      className={`inline-block h-2.5 w-2.5 rounded-full ${debe ? 'bg-amber-500' : 'bg-emerald-500'}`}
      aria-label={debe ? 'Con deuda' : 'Sin deuda'}
    />
  );
}

export function Clientes() {
  const [texto, setTexto] = useState('');

  const consulta = useQuery({
    queryKey: ['personas', 'CLIENTE', texto],
    queryFn: () => api<Persona[]>(`/personas?tipo=CLIENTE&q=${encodeURIComponent(texto)}`),
  });

  const clientes = consulta.data ?? [];
  const conDeuda = clientes.filter((c) =>
    MONEDAS.some((m) => D(c.saldos?.[m] ?? '0').greaterThan(0)),
  );
  const alDia = clientes.filter((c) => !conDeuda.includes(c));

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Clientes</h1>

      <Campo valor={texto} onChange={setTexto} placeholder="Buscar cliente…" />

      {consulta.isLoading && <Cargando />}

      {!consulta.isLoading && clientes.length === 0 && (
        <Vacio mensaje="No hay clientes todavía. Se crean solos al registrar una venta." />
      )}

      {conDeuda.length > 0 && (
        <Tarjeta titulo={`Te deben (${conDeuda.length})`}>
          <Lista personas={conDeuda} />
        </Tarjeta>
      )}

      {alDia.length > 0 && (
        <Tarjeta titulo={`Al día (${alDia.length})`}>
          <Lista personas={alDia} />
        </Tarjeta>
      )}
    </div>
  );
}

function Lista({ personas }: { personas: Persona[] }) {
  return (
    <ul className="divide-y divide-slate-100 dark:divide-slate-800">
      {personas.map((persona) => {
        const saldos = MONEDAS.filter((m) => Number(persona.saldos?.[m] ?? '0') !== 0);
        const debe = saldos.some((m) => D(persona.saldos[m]!).greaterThan(0));

        return (
          <li key={persona.id}>
            <Link
              to={`/clientes/${persona.id}`}
              className="flex items-center justify-between gap-3 py-3"
            >
              <span className="flex min-w-0 items-center gap-2">
                <Semaforo debe={debe} />
                <span className="min-w-0">
                  <span className="block truncate font-medium">{persona.nombre}</span>
                  {persona.telefono && (
                    <span className="text-xs opacity-50">{persona.telefono}</span>
                  )}
                </span>
              </span>
              <span className="tabular shrink-0 text-right text-sm">
                {saldos.length === 0 ? (
                  <span className="opacity-40">—</span>
                ) : (
                  saldos.map((m) => (
                    <span key={m} className="block">
                      {formatMoney(money(persona.saldos[m]!, m))}
                    </span>
                  ))
                )}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
