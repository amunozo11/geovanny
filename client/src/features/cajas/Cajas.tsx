import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { D, MONEDAS, formatMoney, money, type Moneda } from '@geovanny/shared';
import type { ApiError } from '../../lib/api';
import { api } from '../../lib/api';
import { useMoneda } from '../moneda/contexto';
import { Aviso, Boton, Campo, Cargando, Seleccion, Tarjeta, Vacio } from '../../components/ui/base';
import { CampoDinero } from '../../components/ui/CampoDinero';
import type { Caja, MovimientoCaja } from '../../lib/tipos';

/**
 * Cajas: dónde está el dinero.
 *
 * Responde la cuarta pregunta del día —"¿cuánto tengo?"— y separa el efectivo
 * por moneda y por sitio, porque los bolívares del bolsillo y los pesos del
 * banco no son la misma plata aunque sumen.
 */
export function Cajas() {
  const { moneda } = useMoneda();
  const clienteDeQuery = useQueryClient();
  const [vista, setVista] = useState<'ninguna' | 'traslado' | 'nueva'>('ninguna');
  const [contando, setContando] = useState<Caja | null>(null);

  const cajas = useQuery({
    queryKey: ['cajas', moneda],
    queryFn: () => api<Caja[]>(`/cajas?moneda=${moneda}`),
  });
  const movimientos = useQuery({
    queryKey: ['cajas', 'movimientos'],
    queryFn: () => api<MovimientoCaja[]>('/cajas/movimientos'),
  });

  if (cajas.isLoading) return <Cargando />;
  const lista = cajas.data ?? [];

  const cerrarYRefrescar = () => {
    setVista('ninguna');
    setContando(null);
    void clienteDeQuery.invalidateQueries();
  };

  return (
    <div className="space-y-4">
      <div>
        <Link to="/mas" className="text-sm opacity-60">
          ← Más
        </Link>
        <h1 className="text-xl font-bold">Cajas</h1>
      </div>

      {lista.length === 0 ? (
        <Vacio
          mensaje="No tienes cajas. Crea una y el sistema empezará a llevarte el dinero."
          accion={<Boton onClick={() => setVista('nueva')}>Crear la primera</Boton>}
        />
      ) : (
        <>
          <div className="space-y-2">
            {lista.map((caja) => {
              const enNegativo = D(caja.saldo).isNegative();
              return (
                <div
                  key={caja.id}
                  className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold">{caja.nombre}</p>
                      <p className="text-xs opacity-60">
                        {caja.tipo.toLowerCase()} · {caja.moneda}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p
                        className={`tabular text-xl font-bold ${enNegativo ? 'text-rose-600' : ''}`}
                      >
                        {formatMoney(money(caja.saldo, caja.moneda))}
                      </p>
                      {/* La equivalencia solo aporta si hay algo que convertir. */}
                      {caja.moneda !== moneda && !D(caja.saldo).isZero() && (
                        <p className="tabular text-xs opacity-50">
                          ≈ {formatMoney(money(caja.convertido ?? '0', moneda))}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="mt-3 flex justify-end">
                    <button
                      type="button"
                      onClick={() => setContando(caja)}
                      className="text-sm underline opacity-70"
                    >
                      Contar la caja
                    </button>
                  </div>

                  {contando?.id === caja.id && (
                    <FormularioConteo caja={caja} onListo={cerrarYRefrescar} onCancelar={() => setContando(null)} />
                  )}
                </div>
              );
            })}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Boton variante="secundario" onClick={() => setVista('traslado')}>
              Mover plata
            </Boton>
            <Boton variante="secundario" onClick={() => setVista('nueva')}>
              Nueva caja
            </Boton>
          </div>
        </>
      )}

      {vista === 'traslado' && (
        <FormularioTraslado cajas={lista} onListo={cerrarYRefrescar} onCancelar={() => setVista('ninguna')} />
      )}
      {vista === 'nueva' && (
        <FormularioNuevaCaja onListo={cerrarYRefrescar} onCancelar={() => setVista('ninguna')} />
      )}

      <Tarjeta titulo="Últimos movimientos">
        {(movimientos.data ?? []).length === 0 ? (
          <Vacio mensaje="Todavía no se ha movido dinero." />
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {(movimientos.data ?? []).slice(0, 25).map((m) => {
              const entra = !D(m.monto).isNegative();
              return (
                <li key={m.id} className="flex items-start justify-between gap-3 py-2.5">
                  <span className="min-w-0">
                    <span className="block truncate text-sm">{m.concepto}</span>
                    <span className="text-xs opacity-50">
                      {m.cajaNombre} · {new Date(m.fecha).toLocaleDateString('es-CO')}
                      {m.motivo ? ` · ${m.motivo}` : ''}
                    </span>
                  </span>
                  <span
                    className={`tabular shrink-0 text-sm ${
                      entra ? 'text-emerald-600 dark:text-emerald-400' : 'opacity-70'
                    }`}
                  >
                    {entra ? '+' : ''}
                    {formatMoney(money(m.monto, m.moneda))}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Tarjeta>
    </div>
  );
}

/**
 * Conteo: se escribe cuánto hay de verdad, no la diferencia.
 * Restar de cabeza es justo donde se cometen los errores.
 */
function FormularioConteo({
  caja,
  onListo,
  onCancelar,
}: {
  caja: Caja;
  onListo: () => void;
  onCancelar: () => void;
}) {
  const [saldoReal, setSaldoReal] = useState('');
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState<string | null>(null);

  const guardar = useMutation({
    mutationFn: () =>
      api(`/cajas/${caja.id}/ajuste`, {
        method: 'POST',
        body: JSON.stringify({ saldoReal, motivo }),
      }),
    onSuccess: onListo,
    onError: (e: ApiError) => setError(e.message),
  });

  const diferencia = saldoReal ? D(saldoReal).minus(D(caja.saldo)) : null;

  return (
    <div className="mt-3 space-y-3 border-t border-slate-200 pt-3 dark:border-slate-800">
      <CampoDinero
        etiqueta="¿Cuánto hay realmente?"
        valor={saldoReal}
        onChange={setSaldoReal}
        autoFocus
      />
      {diferencia && !diferencia.isZero() && (
        <p className="tabular text-sm">
          {diferencia.isNegative() ? 'Falta ' : 'Sobra '}
          <strong>{formatMoney(money(diferencia.abs().toString(), caja.moneda))}</strong>
        </p>
      )}
      <Campo etiqueta="Motivo" valor={motivo} onChange={setMotivo} placeholder="Obligatorio" />
      {error && <Aviso tono="error">{error}</Aviso>}
      <div className="flex gap-2">
        <Boton variante="secundario" onClick={onCancelar} className="flex-1">
          Cancelar
        </Boton>
        <Boton
          onClick={() => guardar.mutate()}
          disabled={!saldoReal || !motivo || guardar.isPending}
          className="flex-1"
        >
          Guardar
        </Boton>
      </div>
    </div>
  );
}

/**
 * Mover plata de una caja a otra. Si las cajas son de monedas distintas, esto
 * ES un cambio de divisa: se puede escribir cuánto se recibió realmente, que es
 * como se hace en la calle, y el sistema deduce la tasa.
 */
function FormularioTraslado({
  cajas,
  onListo,
  onCancelar,
}: {
  cajas: Caja[];
  onListo: () => void;
  onCancelar: () => void;
}) {
  const [origenId, setOrigenId] = useState(cajas[0]?.id ?? '');
  const [destinoId, setDestinoId] = useState(cajas[1]?.id ?? cajas[0]?.id ?? '');
  const [monto, setMonto] = useState('');
  const [montoDestino, setMontoDestino] = useState('');
  const [error, setError] = useState<string | null>(null);

  const origen = cajas.find((c) => c.id === origenId);
  const destino = cajas.find((c) => c.id === destinoId);
  const esCambio = origen && destino && origen.moneda !== destino.moneda;

  const guardar = useMutation({
    mutationFn: () =>
      api('/cajas/traslado', {
        method: 'POST',
        body: JSON.stringify({
          origenId,
          destinoId,
          monto,
          montoDestino: esCambio && montoDestino ? montoDestino : null,
        }),
      }),
    onSuccess: onListo,
    onError: (e: ApiError) => setError(e.message),
  });

  const opciones = cajas.map((c) => ({
    valor: c.id,
    texto: `${c.nombre} — ${formatMoney(money(c.saldo, c.moneda))}`,
  }));

  return (
    <Tarjeta titulo="Mover plata">
      <div className="space-y-3">
        <Seleccion etiqueta="De" valor={origenId} onChange={setOrigenId} opciones={opciones} />
        <Seleccion etiqueta="A" valor={destinoId} onChange={setDestinoId} opciones={opciones} />
        <CampoDinero
          etiqueta={`Cuánto sale${origen ? ` (${origen.moneda})` : ''}`}
          valor={monto}
          onChange={setMonto}
        />

        {esCambio && (
          <>
            <Aviso tono="info">
              Estás cambiando {origen!.moneda} por {destino!.moneda}. Si lo dejas vacío se usa la
              tasa del día; si escribes cuánto recibiste, se guarda la tasa real de ese cambio.
            </Aviso>
            <CampoDinero
              etiqueta={`Cuánto recibes en ${destino!.moneda} (opcional)`}
              valor={montoDestino}
              onChange={setMontoDestino}
            />
          </>
        )}

        {error && <Aviso tono="error">{error}</Aviso>}

        <div className="flex gap-2">
          <Boton variante="secundario" onClick={onCancelar} className="flex-1">
            Cancelar
          </Boton>
          <Boton
            onClick={() => guardar.mutate()}
            disabled={!monto || origenId === destinoId || guardar.isPending}
            className="flex-1"
          >
            Mover
          </Boton>
        </div>
      </div>
    </Tarjeta>
  );
}

function FormularioNuevaCaja({
  onListo,
  onCancelar,
}: {
  onListo: () => void;
  onCancelar: () => void;
}) {
  const [nombre, setNombre] = useState('');
  const [moneda, setMoneda] = useState<Moneda>('VES');
  const [tipo, setTipo] = useState('EFECTIVO');
  const [saldoInicial, setSaldoInicial] = useState('');
  const [error, setError] = useState<string | null>(null);

  const guardar = useMutation({
    mutationFn: () =>
      api('/cajas', {
        method: 'POST',
        body: JSON.stringify({ nombre, moneda, tipo, saldoInicial: saldoInicial || undefined }),
      }),
    onSuccess: onListo,
    onError: (e: ApiError) => setError(e.message),
  });

  return (
    <Tarjeta titulo="Nueva caja">
      <div className="space-y-3">
        <Campo
          etiqueta="Nombre"
          valor={nombre}
          onChange={setNombre}
          placeholder="Pago móvil, Banco…"
          autoFocus
        />
        <div className="grid grid-cols-2 gap-3">
          <Seleccion
            etiqueta="Moneda"
            valor={moneda}
            onChange={setMoneda}
            opciones={MONEDAS.map((m) => ({ valor: m, texto: m }))}
          />
          <Seleccion
            etiqueta="Tipo"
            valor={tipo}
            onChange={setTipo}
            opciones={[
              { valor: 'EFECTIVO', texto: 'Efectivo' },
              { valor: 'BANCO', texto: 'Banco' },
              { valor: 'MOVIL', texto: 'Pago móvil' },
              { valor: 'OTRO', texto: 'Otro' },
            ]}
          />
        </div>
        <CampoDinero
          etiqueta="¿Cuánto hay ahora? (opcional)"
          valor={saldoInicial}
          onChange={setSaldoInicial}
        />
        {error && <Aviso tono="error">{error}</Aviso>}
        <div className="flex gap-2">
          <Boton variante="secundario" onClick={onCancelar} className="flex-1">
            Cancelar
          </Boton>
          <Boton onClick={() => guardar.mutate()} disabled={!nombre} className="flex-1">
            Crear
          </Boton>
        </div>
      </div>
    </Tarjeta>
  );
}
