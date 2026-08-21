import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatRate } from '@geovanny/shared';
import type { ApiError} from '../../lib/api';
import { api } from '../../lib/api';
import { Aviso, Boton, Campo, Cargando, Tarjeta } from '../../components/ui/base';
import type { Tasa } from '../../lib/tipos';

interface RespuestaTasas {
  vigente: Tasa | null;
  antiguedadHoras: number | null;
  historial: Tasa[];
}

/**
 * La tasa del día: dos números y ya.
 *
 * Se puede traer de internet o escribir a mano, y siempre queda registrado de
 * dónde salió. Escribirla a mano nunca deja de estar disponible: si no hay
 * señal, el negocio no puede parar (RC-05).
 */
export function Tasas() {
  const clienteDeQuery = useQueryClient();
  const [usdCop, setUsdCop] = useState('');
  const [usdVes, setUsdVes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const consulta = useQuery({
    queryKey: ['tasas'],
    queryFn: () => api<RespuestaTasas>('/tasas'),
  });

  const refrescar = () => {
    setError(null);
    setAviso(null);
    void clienteDeQuery.invalidateQueries();
  };

  const desdeInternet = useMutation({
    mutationFn: () => api<Tasa>('/tasas/actualizar', { method: 'POST' }),
    onSuccess: (tasa) => {
      refrescar();
      setAviso(`Actualizada: 1 USD = ${tasa.usdCop} COP y ${tasa.usdVes} Bs.`);
    },
    onError: (e: ApiError) => setError(e.message),
  });

  const aMano = useMutation({
    mutationFn: () =>
      api<Tasa>('/tasas', { method: 'POST', body: JSON.stringify({ usdCop, usdVes }) }),
    onSuccess: () => {
      refrescar();
      setUsdCop('');
      setUsdVes('');
      setAviso('Tasa guardada.');
    },
    onError: (e: ApiError) => setError(e.message),
  });

  if (consulta.isLoading) return <Cargando />;
  const datos = consulta.data!;

  return (
    <div className="space-y-4">
      <div>
        <Link to="/mas" className="text-sm opacity-60">
          ← Más
        </Link>
        <h1 className="text-xl font-bold">Tasa del día</h1>
      </div>

      <Tarjeta destacada titulo="Ahora mismo">
        {datos.vigente ? (
          <>
            <p className="tabular text-lg">{formatRate('USD', 'COP', datos.vigente.usdCop)}</p>
            <p className="tabular text-lg">{formatRate('USD', 'VES', datos.vigente.usdVes)}</p>
            <p className="mt-2 text-xs opacity-60">
              {datos.vigente.fuente === 'API' ? 'Tomada de internet' : 'Puesta a mano'} ·{' '}
              {datos.antiguedadHoras !== null && datos.antiguedadHoras < 1
                ? 'hace un momento'
                : `hace ${Math.round(datos.antiguedadHoras ?? 0)} h`}
            </p>
          </>
        ) : (
          <p>Todavía no hay tasa. Ponla abajo para poder operar.</p>
        )}
      </Tarjeta>

      {aviso && <Aviso tono="bien">{aviso}</Aviso>}
      {error && (
        <Aviso tono="error">
          {error}
          <p className="mt-1">Puedes escribirla a mano aquí abajo.</p>
        </Aviso>
      )}

      <Boton
        variante="secundario"
        onClick={() => desdeInternet.mutate()}
        disabled={desdeInternet.isPending}
        className="w-full"
      >
        {desdeInternet.isPending ? 'Consultando…' : 'Traer de internet'}
      </Boton>

      <Tarjeta titulo="Ponerla a mano">
        <div className="space-y-3">
          <Campo etiqueta="1 dólar, ¿cuántos pesos?" valor={usdCop} onChange={setUsdCop} numerico />
          <Campo
            etiqueta="1 dólar, ¿cuántos bolívares?"
            valor={usdVes}
            onChange={setUsdVes}
            numerico
          />
          <Boton
            onClick={() => aMano.mutate()}
            disabled={!usdCop || !usdVes || aMano.isPending}
            className="w-full"
          >
            Guardar tasa
          </Boton>
          <p className="text-xs opacity-60">
            Guardar una tasa nueva no cambia ninguna venta ni compra anterior: cada operación se
            quedó con la tasa que tenía el día que se hizo.
          </p>
        </div>
      </Tarjeta>

      <Tarjeta titulo="Historial">
        <ul className="divide-y divide-slate-100 text-sm dark:divide-slate-800">
          {datos.historial.map((tasa, indice) => (
            <li key={tasa.id ?? indice} className="flex items-center justify-between py-2">
              <span className="tabular">
                {tasa.usdCop} COP · {tasa.usdVes} Bs
              </span>
              <span className="text-xs opacity-50">
                {new Date(tasa.at).toLocaleString('es-CO')} ·{' '}
                {tasa.fuente === 'API' ? 'internet' : 'a mano'}
              </span>
            </li>
          ))}
        </ul>
      </Tarjeta>
    </div>
  );
}
