import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MONEDAS, type Moneda } from '@geovanny/shared';
import type { ApiError} from '../../lib/api';
import { api } from '../../lib/api';
import { Plata } from '../../components/ui/Plata';
import { Aviso, Boton, Campo, Cargando, Seleccion, Tarjeta, Vacio } from '../../components/ui/base';
import type { Gasto } from '../../lib/tipos';
import { SelectorCaja } from '../cajas/SelectorCaja';
import { CampoFecha, comoInstante, hoy } from '../../components/ui/CampoFecha';

const CATEGORIAS = [
  'TRANSPORTE',
  'CARGUE',
  'COMBUSTIBLE',
  'ALIMENTACION',
  'COMISIONES',
  'ARRIENDO',
  'SERVICIOS',
  'NOMINA',
  'OTROS',
];

const FIJOS = ['ARRIENDO', 'SERVICIOS', 'NOMINA'];

export function Gastos() {
  const clienteDeQuery = useQueryClient();
  const [categoria, setCategoria] = useState('TRANSPORTE');
  const [descripcion, setDescripcion] = useState('');
  const [monto, setMonto] = useState('');
  const [moneda, setMoneda] = useState<Moneda>('COP');
  const [cajaId, setCajaId] = useState('');
  const [dia, setDia] = useState(hoy());
  const [error, setError] = useState<string | null>(null);

  const consulta = useQuery({ queryKey: ['gastos'], queryFn: () => api<Gasto[]>('/gastos') });

  const registrar = useMutation({
    mutationFn: () =>
      api('/gastos', {
        method: 'POST',
        body: JSON.stringify({
          categoria,
          tipo: FIJOS.includes(categoria) ? 'FIJO' : 'VARIABLE',
          descripcion,
          monto,
          moneda,
          cajaId: cajaId || null,
          fecha: dia === hoy() ? undefined : comoInstante(dia),
        }),
      }),
    onSuccess: () => {
      setMonto('');
      setDescripcion('');
      void clienteDeQuery.invalidateQueries();
    },
    onError: (e: ApiError) => setError(e.message),
  });

  return (
    <div className="space-y-4">
      <div>
        <Link to="/mas" className="text-sm opacity-60">
          ← Más
        </Link>
        <h1 className="text-xl font-bold">Gastos</h1>
      </div>

      <Tarjeta titulo="Anotar un gasto">
        <div className="space-y-3">
          <Seleccion
            etiqueta="Categoría"
            valor={categoria}
            onChange={setCategoria}
            opciones={CATEGORIAS.map((c) => ({
              valor: c,
              texto: `${c.toLowerCase()}${FIJOS.includes(c) ? ' (fijo)' : ''}`,
            }))}
          />
          <div className="grid grid-cols-2 gap-3">
            <Campo etiqueta="Monto" valor={monto} onChange={setMonto} numerico />
            <Seleccion
              etiqueta="Moneda"
              valor={moneda}
              onChange={setMoneda}
              opciones={MONEDAS.map((m) => ({ valor: m, texto: m }))}
            />
          </div>
          <Campo
            etiqueta="¿En qué fue?"
            valor={descripcion}
            onChange={setDescripcion}
            placeholder="Opcional"
          />
          <SelectorCaja
            moneda={moneda}
            valor={cajaId}
            onChange={setCajaId}
            etiqueta="¿De dónde sale la plata?"
          />
          <CampoFecha valor={dia} onChange={setDia} etiqueta="¿Qué día fue el gasto?" />
          {error && <Aviso tono="error">{error}</Aviso>}
          <Boton
            onClick={() => registrar.mutate()}
            disabled={!monto || registrar.isPending}
            className="w-full"
          >
            Guardar gasto
          </Boton>
        </div>
      </Tarjeta>

      <Tarjeta titulo="Últimos gastos">
        {consulta.isLoading ? (
          <Cargando />
        ) : (consulta.data ?? []).length === 0 ? (
          <Vacio mensaje="Todavía no has anotado gastos." />
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {(consulta.data ?? []).map((gasto) => (
              <li key={gasto.id} className="flex items-start justify-between gap-3 py-3">
                <span className="min-w-0">
                  <span className="block truncate font-medium">
                    {gasto.categoria.toLowerCase()}
                  </span>
                  <span className="text-xs opacity-60">
                    {gasto.descripcion || '—'} ·{' '}
                    {new Date(gasto.fecha).toLocaleDateString('es-CO')}
                  </span>
                </span>
                <Plata importe={gasto.importe} className="shrink-0 text-right" />
              </li>
            ))}
          </ul>
        )}
      </Tarjeta>
    </div>
  );
}
