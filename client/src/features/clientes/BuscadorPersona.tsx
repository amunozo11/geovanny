import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MONEDAS, formatMoney, money } from '@geovanny/shared';
import { api } from '../../lib/api';
import { Boton, Campo } from '../../components/ui/base';
import type { Persona } from '../../lib/tipos';

/**
 * Buscar una persona y, si no está, crearla ahí mismo.
 *
 * Sus clientes son apodos —CHIVO, MEMIN, GUARAPO— y aparecen por primera vez en
 * mitad de una venta. Obligar a salir a otra pantalla a darlos de alta rompería
 * la venta, así que se crean con solo el nombre (CN-3).
 */
export function BuscadorPersona({
  tipo,
  elegida,
  onElegir,
}: {
  tipo: 'CLIENTE' | 'PROVEEDOR' | 'TRANSPORTE';
  elegida: Persona | null;
  onElegir: (persona: Persona | null) => void;
}) {
  const [texto, setTexto] = useState('');
  const clienteDeQuery = useQueryClient();

  const personas = useQuery({
    queryKey: ['personas', tipo, texto],
    queryFn: () => api<Persona[]>(`/personas?tipo=${tipo}&q=${encodeURIComponent(texto)}`),
    enabled: !elegida,
  });

  const crear = useMutation({
    mutationFn: (nombre: string) =>
      api<Persona>('/personas', { method: 'POST', body: JSON.stringify({ nombre, tipo }) }),
    onSuccess: (persona) => {
      void clienteDeQuery.invalidateQueries({ queryKey: ['personas'] });
      onElegir(persona);
      setTexto('');
    },
  });

  if (elegida) {
    const deudas = MONEDAS.filter((m) => Number(elegida.saldos?.[m] ?? '0') !== 0);
    return (
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold">{elegida.nombre}</p>
          {deudas.length > 0 ? (
            <p className="tabular text-xs text-amber-600 dark:text-amber-400">
              Debe {deudas.map((m) => formatMoney(money(elegida.saldos[m]!, m))).join(' · ')}
            </p>
          ) : (
            <p className="text-xs opacity-50">Sin deuda</p>
          )}
        </div>
        <button
          type="button"
          onClick={() => onElegir(null)}
          className="shrink-0 text-sm underline opacity-60"
        >
          cambiar
        </button>
      </div>
    );
  }

  const encontradas = personas.data ?? [];
  const nombreLibre = texto.trim();
  const yaExiste = encontradas.some(
    (p) => p.nombre.toLowerCase() === nombreLibre.toLowerCase(),
  );

  return (
    <div>
      <Campo valor={texto} onChange={setTexto} placeholder="Buscar o escribir un nombre…" />

      <ul className="mt-2 divide-y divide-slate-100 dark:divide-slate-800">
        {encontradas.slice(0, 6).map((persona) => (
          <li key={persona.id}>
            <button
              type="button"
              onClick={() => onElegir(persona)}
              className="flex w-full items-center justify-between py-3 text-left"
            >
              <span className="truncate font-medium">{persona.nombre}</span>
              <span className="tabular shrink-0 text-xs opacity-60">
                {MONEDAS.filter((m) => Number(persona.saldos?.[m] ?? '0') !== 0)
                  .map((m) => formatMoney(money(persona.saldos[m]!, m)))
                  .join(' · ')}
              </span>
            </button>
          </li>
        ))}
      </ul>

      {nombreLibre.length > 1 && !yaExiste && (
        <Boton
          variante="secundario"
          onClick={() => crear.mutate(nombreLibre)}
          disabled={crear.isPending}
          className="mt-2 w-full"
        >
          {crear.isPending ? 'Creando…' : `Crear "${nombreLibre}"`}
        </Boton>
      )}
    </div>
  );
}
