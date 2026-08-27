import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  D,
  MONEDAS,
  cantidadTexto,
  conUnidad,
  formatMoney,
  formatRate,
  money,
  type Moneda,
} from '@geovanny/shared';
import type { ApiError } from '../../lib/api';
import { api } from '../../lib/api';
import { Aviso, Boton, Campo, Cargando, Tarjeta, Vacio } from '../../components/ui/base';
import { CampoDinero } from '../../components/ui/CampoDinero';
import { TiraDeDias, comoInstante, etiquetaDia, hoy } from '../../components/ui/CampoFecha';
import { useAuth } from '../auth/AuthContext';
import type { InformeTodo, PorMoneda } from '../../lib/tipos';

/**
 * TODO: el día entero, moneda por moneda.
 *
 * Es el cierre de la última página del cuaderno. Lo que manda aquí es que
 * **nada se convierte**: los bolívares y los dólares están en bolsillos
 * distintos y se cuentan por separado. En las otras pantallas todo se lleva a
 * una sola moneda para poder comparar; para cerrar la caja eso no sirve.
 *
 * Al final se escribe lo que se contó de verdad y una observación, y ese
 * sobrante es el saldo con el que arranca el día siguiente.
 */

const NOMBRE: Record<Moneda, string> = { COP: 'Pesos', USD: 'Dólares', VES: 'Bolívares' };

/** Las monedas que aparecen en alguna de estas bolsas. Ninguna en cero de adorno. */
function monedasCon(...bolsas: (PorMoneda | undefined)[]): Moneda[] {
  const usadas = MONEDAS.filter((m) => bolsas.some((b) => b && !D(b[m] ?? '0').isZero()));
  return usadas.length > 0 ? usadas : ['VES', 'USD'];
}

/** Una fila de dinero con una columna por moneda. El corazón de la pantalla. */
function Fila({
  texto,
  bolsa,
  monedas,
  signo,
  fuerte = false,
  ayuda,
}: {
  texto: string;
  bolsa: PorMoneda;
  monedas: Moneda[];
  signo?: '+' | '−';
  fuerte?: boolean;
  ayuda?: string;
}) {
  return (
    <div
      className={[
        'flex items-start justify-between gap-3 py-2',
        fuerte ? 'font-bold' : '',
      ].join(' ')}
    >
      <span className="min-w-0">
        <span className={fuerte ? 'text-sm' : 'text-sm opacity-80'}>
          {signo && <span className="mr-1 opacity-50">{signo}</span>}
          {texto}
        </span>
        {ayuda && <span className="block text-xs font-normal opacity-50">{ayuda}</span>}
      </span>
      <span className="shrink-0 text-right">
        {monedas.map((m) => (
          <span key={m} className={`tabular block ${fuerte ? 'text-base' : 'text-sm'}`}>
            {formatMoney(money(bolsa[m] ?? '0', m))}
          </span>
        ))}
      </span>
    </div>
  );
}

export function Todo() {
  const clienteDeQuery = useQueryClient();
  const { puede } = useAuth();
  const [dia, setDia] = useState(hoy());

  const consulta = useQuery({
    queryKey: ['todo', dia],
    queryFn: () => api<InformeTodo>(`/todo?dia=${dia}`),
  });

  if (consulta.isLoading) return <Cargando />;
  if (consulta.isError || !consulta.data) {
    return <Aviso tono="error">No se pudo cargar el día. Revisa la conexión.</Aviso>;
  }

  const informe = consulta.data;
  const refrescar = () => void clienteDeQuery.invalidateQueries();

  // Las monedas del día: las que se movieron en cualquier concepto. Si el día
  // está vacío se enseñan bolívares y dólares, que es lo que se maneja.
  const monedas = monedasCon(
    informe.vieneDeAntes.sobrante,
    informe.entradas.recogido,
    informe.salidas.total,
    informe.ventas.vendido,
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">Todo</h1>
        <p className="text-xs opacity-60">
          El día completo, moneda por moneda. Aquí nada se convierte: los bolívares y los dólares
          se cuentan por separado.
        </p>
      </div>

      <Tarjeta titulo="Qué día">
        <TiraDeDias valor={dia} onChange={setDia} />
      </Tarjeta>

      {/* ── Lo vendido ─────────────────────────────────────────────────── */}
      <Tarjeta titulo="Cuánto salió de cada producto">
        {informe.ventas.porProducto.length === 0 ? (
          <Vacio mensaje="No se vendió nada este día." />
        ) : (
          <>
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {informe.ventas.porProducto.map((fila) => (
                <FilaProducto key={fila.nombre} fila={fila} />
              ))}
            </ul>

            <div className="mt-2 border-t border-slate-200 pt-2 dark:border-slate-800">
              <Fila texto="Total vendido" bolsa={informe.ventas.vendido} monedas={monedas} fuerte />
              <Fila
                texto="De eso, cobrado en el acto"
                bolsa={informe.ventas.contado}
                monedas={monedas}
              />
              <Fila
                texto="De eso, quedó fiado"
                bolsa={informe.ventas.fiado}
                monedas={monedas}
                ayuda="No entró plata: está en la cuenta de los clientes"
              />
            </div>
          </>
        )}
      </Tarjeta>

      {/* ── Lo que entró ───────────────────────────────────────────────── */}
      <Tarjeta titulo="Lo que se recogió">
        <Fila
          texto={
            informe.vieneDeAntes.dia
              ? `Vienes del ${etiquetaDia(informe.vieneDeAntes.dia).toLowerCase()}`
              : 'Vienes de antes'
          }
          bolsa={informe.vieneDeAntes.sobrante}
          monedas={monedas}
          signo="+"
          ayuda={
            informe.vieneDeAntes.sinAncla
              ? 'Arrastrado solo desde el primer movimiento'
              : [
                  informe.vieneDeAntes.observacion,
                  'Lo que contaste, más todo lo movido desde entonces',
                ]
                  .filter(Boolean)
                  .join(' · ')
          }
        />
        <Fila
          texto="Ventas cobradas hoy"
          bolsa={informe.entradas.contado}
          monedas={monedas}
          signo="+"
        />
        <Fila
          texto="Abonos de clientes"
          bolsa={informe.entradas.cobrado}
          monedas={monedas}
          signo="+"
          ayuda="Deudas viejas que pagaron hoy"
        />
      </Tarjeta>

      {/* ── Lo que salió ───────────────────────────────────────────────── */}
      <Tarjeta titulo="Lo que se gastó en el camino">
        {informe.salidas.gastos.length === 0 ? (
          <p className="py-1 text-sm opacity-60">Todavía no hay gastos anotados este día.</p>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {informe.salidas.gastos.map((gasto) => (
              <FilaGasto
                key={gasto.id}
                gasto={gasto}
                puedeQuitar={puede('expense:write')}
                onListo={refrescar}
              />
            ))}
          </ul>
        )}

        {puede('expense:write') && <NuevoGasto dia={dia} onListo={refrescar} />}

        {(informe.salidas.pagos.length > 0 || informe.salidas.prestamos.length > 0) && (
          <div className="mt-3 space-y-1 border-t border-slate-200 pt-3 text-xs dark:border-slate-800">
            {informe.salidas.pagos.map((pago) => (
              <p key={pago.id} className="flex justify-between gap-2 opacity-70">
                <span className="truncate">Abono a {pago.persona}</span>
                <span className="tabular shrink-0">
                  − {formatMoney(money(pago.monto, pago.moneda))}
                </span>
              </p>
            ))}
            {informe.salidas.prestamos.map((prestamo) => (
              <p key={prestamo.id} className="flex justify-between gap-2 opacity-70">
                <span className="truncate">
                  Préstamo a {prestamo.persona} · {prestamo.concepto}
                </span>
                <span className="tabular shrink-0">
                  − {formatMoney(money(prestamo.monto, prestamo.moneda))}
                </span>
              </p>
            ))}
            <p className="pt-1 opacity-50">
              Estos salieron por otras pantallas, pero también sacaron plata del cajón.
            </p>
          </div>
        )}

        <div className="mt-2 border-t border-slate-200 pt-2 dark:border-slate-800">
          <Fila
            texto="Total que salió"
            bolsa={informe.salidas.total}
            monedas={monedas}
            signo="−"
            fuerte
          />
        </div>
      </Tarjeta>

      {/* ── La cuenta final ────────────────────────────────────────────── */}
      <Tarjeta destacada>
        <p className="mb-2 text-xs tracking-wide uppercase opacity-60">Debería quedar</p>
        <div className="space-y-2">
          {monedas.map((m) => (
            <div key={m} className="flex items-baseline justify-between gap-3">
              <span className="text-sm opacity-70">{NOMBRE[m]}</span>
              <span className="tabular text-2xl font-bold">
                {formatMoney(money(informe.deberiaQuedar[m], m))}
              </span>
            </div>
          ))}
        </div>
        <p className="mt-3 border-t border-white/15 pt-2 text-xs opacity-60">
          Lo que traías, más lo que recogiste, menos lo que salió. Es lo que tendría que haber en el
          cajón ahora mismo.
        </p>
      </Tarjeta>

      {(informe.movimientos.ventas.length > 0 || informe.movimientos.abonos.length > 0) && (
        <Tarjeta titulo="Todo lo del día, con nombre">
          {informe.movimientos.ventas.length > 0 && (
            <>
              <p className="mb-1 text-xs font-semibold tracking-wide uppercase opacity-50">
                Ventas ({informe.movimientos.ventas.length})
              </p>
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {informe.movimientos.ventas.map((venta) => {
                  const debe = D(venta.aDeber).greaterThan(0);
                  return (
                    <li key={venta.id} className="py-2">
                      <Link
                        to={`/ventas/${venta.id}`}
                        className="flex items-start justify-between gap-3"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium">
                            {venta.persona}
                            {venta.deMostrador && (
                              <span className="ml-1 text-xs font-normal opacity-50">mostrador</span>
                            )}
                          </span>
                          <span className="tabular block truncate text-xs opacity-60">
                            {venta.productos
                              .map((p) => `${cantidadTexto(p.cantidad)} ${p.nombre.toLowerCase()}`)
                              .join(' · ')}
                          </span>
                          <span className="text-xs opacity-40">
                            {venta.numero} · {venta.hora}
                          </span>
                        </span>
                        <span className="shrink-0 text-right">
                          <span className="tabular block text-sm font-semibold">
                            {formatMoney(money(venta.total, venta.moneda))}
                          </span>
                          <span
                            className={`tabular block text-xs ${debe ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}
                          >
                            {debe ? `fiado ${formatMoney(money(venta.aDeber, venta.moneda))}` : 'pagada'}
                          </span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </>
          )}

          {informe.movimientos.abonos.length > 0 && (
            <>
              <p className="mt-3 mb-1 text-xs font-semibold tracking-wide uppercase opacity-50">
                Abonos ({informe.movimientos.abonos.length})
              </p>
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {informe.movimientos.abonos.map((abono) => (
                  <li key={abono.id} className="flex items-baseline justify-between gap-3 py-2">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{abono.persona}</span>
                      <span className="text-xs opacity-50">
                        {abono.numero} · {abono.hora} · {abono.metodo.toLowerCase()}
                      </span>
                    </span>
                    <span className="tabular shrink-0 text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                      + {formatMoney(money(abono.monto, abono.moneda))}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Tarjeta>
      )}

      {informe.tasa && (
        <p className="text-center text-xs opacity-40">
          {formatRate('USD', 'VES', informe.tasa.usdVes)} ·{' '}
          {formatRate('USD', 'COP', informe.tasa.usdCop)}
          {informe.tasaFijada && ' · fijada al cerrar el día'}
        </p>
      )}

      <FormularioCierre informe={informe} monedas={monedas} onListo={refrescar} />
    </div>
  );
}

/**
 * Un producto del día, que se abre y enseña quién se lo llevó.
 *
 * El total dice "salieron 61 bultos". Para trabajar hace falta saber que 12 se
 * los llevó Memín fiados y 8 se pagaron en el mostrador: un número grande sin
 * nombres detrás no se puede perseguir.
 */
function FilaProducto({ fila }: { fila: InformeTodo['ventas']['porProducto'][number] }) {
  const [abierto, setAbierto] = useState(false);
  const enMonedas = MONEDAS.filter((m) => !D(fila.vendido[m]).isZero());
  const fiadoEn = MONEDAS.filter((m) => D(fila.fiado[m]).greaterThan(0));

  return (
    <li>
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        className="flex w-full items-start justify-between gap-3 py-2.5 text-left"
      >
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold">
            {fila.nombre}
            <span className="ml-1 text-xs font-normal opacity-40">{abierto ? '▾' : '▸'}</span>
          </span>
          <span className="tabular text-xs opacity-60">
            {conUnidad(fila.cantidad, fila.unidad)} en {fila.registros}{' '}
            {fila.registros === 1 ? 'venta' : 'ventas'}
          </span>
          {fiadoEn.length > 0 && (
            <span className="tabular block text-xs text-amber-600 dark:text-amber-400">
              fiado {fiadoEn.map((m) => formatMoney(money(fila.fiado[m], m))).join(' · ')}
            </span>
          )}
        </span>
        <span className="shrink-0 text-right">
          {enMonedas.map((m) => (
            <span key={m} className="tabular block text-sm font-semibold">
              {formatMoney(money(fila.vendido[m], m))}
            </span>
          ))}
        </span>
      </button>

      {abierto && (
        <ul className="mb-2 space-y-1 rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-800/50">
          {fila.ventas.map((venta, indice) => {
            const debe = D(venta.aDeber).greaterThan(0);
            return (
              <li key={`${venta.id}-${indice}`} className="flex items-baseline justify-between gap-2 text-xs">
                <span className="min-w-0">
                  <span className="font-medium">{venta.persona}</span>
                  {venta.deMostrador && <span className="ml-1 opacity-50">mostrador</span>}
                  <span className="tabular block opacity-60">
                    {conUnidad(venta.cantidad, fila.unidad)} ×{' '}
                    {formatMoney(money(venta.precio, venta.moneda))} · {venta.hora}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="tabular block font-semibold">
                    {formatMoney(money(venta.subtotal, venta.moneda))}
                  </span>
                  <span
                    className={`tabular block ${debe ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}
                  >
                    {debe ? `debe ${formatMoney(money(venta.aDeber, venta.moneda))}` : 'pagado'}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </li>
  );
}

/**
 * Un gasto del día, con su ✕ para quitarlo.
 *
 * Estos se anotan a la carrera mientras se despacha, así que equivocarse es
 * cuestión de tiempo. Quitarlo devuelve la plata a la caja de donde salió y el
 * "debería quedar" de abajo se recalcula solo.
 *
 * Pide confirmación en el sitio: un ✕ suelto junto a una cifra, en un teléfono
 * y con prisa, se pulsa sin querer.
 */
function FilaGasto({
  gasto,
  puedeQuitar,
  onListo,
}: {
  gasto: InformeTodo['salidas']['gastos'][number];
  puedeQuitar: boolean;
  onListo: () => void;
}) {
  const [confirmando, setConfirmando] = useState(false);
  const [observacion, setObservacion] = useState(gasto.observacion ?? '');
  const [error, setError] = useState<string | null>(null);

  /** Se guarda al salir del campo: escribir no debe pedir tocar un botón. */
  const anotar = useMutation({
    mutationFn: () =>
      api(`/gastos/${gasto.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ observacion }),
      }),
    onSuccess: onListo,
    onError: (e: ApiError) => setError(e.message),
  });

  const quitar = useMutation({
    mutationFn: () =>
      api(`/gastos/${gasto.id}/anular`, {
        method: 'POST',
        body: JSON.stringify({ motivo: 'Anotado por equivocación' }),
      }),
    onSuccess: onListo,
    onError: (e: ApiError) => setError(e.message),
  });

  return (
    <li className="py-2">
      <div className="flex items-center justify-between gap-3">
        <span className="min-w-0">
          <span className="block truncate text-sm">
            {gasto.descripcion || gasto.categoria.toLowerCase()}
          </span>
          <span className="text-xs opacity-50">
            {gasto.categoria.toLowerCase()} · {gasto.hora}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-1">
          <span className="text-right">
            <span className="tabular block text-sm">
              − {formatMoney(money(gasto.monto, gasto.moneda))}
            </span>
            {/* Lo mismo en las otras monedas, con la tasa del día en que se
                anotó: un gasto viejo no se revalúa porque hoy el dólar cambió. */}
            {MONEDAS.filter((m) => m !== gasto.moneda && !D(gasto.eq[m]).isZero()).map((m) => (
              <span key={m} className="tabular block text-xs opacity-50">
                {formatMoney(money(gasto.eq[m], m))}
              </span>
            ))}
          </span>
          {puedeQuitar && !confirmando && (
            <button
              type="button"
              aria-label={`Quitar el gasto ${gasto.descripcion || gasto.categoria}`}
              onClick={() => setConfirmando(true)}
              className="px-1 text-lg opacity-40 hover:opacity-100"
            >
              ✕
            </button>
          )}
        </span>
      </div>

      {/* La observación se escribe cuando hay un momento, no al vuelo. */}
      {puedeQuitar && !confirmando && (
        <input
          type="text"
          value={observacion}
          onChange={(evento) => setObservacion(evento.target.value)}
          onBlur={() => {
            if (observacion.trim() !== (gasto.observacion ?? '').trim()) anotar.mutate();
          }}
          placeholder="Observación…"
          aria-label={`Observación de ${gasto.descripcion || gasto.categoria}`}
          className="mt-1 w-full border-b border-dashed border-slate-300 bg-transparent pb-0.5 text-xs outline-none placeholder:opacity-40 focus:border-solid dark:border-slate-700"
        />
      )}
      {!puedeQuitar && gasto.observacion && (
        <p className="mt-1 text-xs opacity-60">{gasto.observacion}</p>
      )}

      {confirmando && (
        <div className="mt-2 space-y-2">
          <p className="text-xs opacity-70">
            ¿Quitar este gasto? La plata vuelve a la caja de donde salió.
          </p>
          {error && <Aviso tono="error">{error}</Aviso>}
          <div className="flex gap-2">
            <Boton
              variante="secundario"
              onClick={() => {
                setConfirmando(false);
                setError(null);
              }}
              className="flex-1 text-sm"
            >
              No
            </Boton>
            <Boton
              variante="peligro"
              onClick={() => quitar.mutate()}
              disabled={quitar.isPending}
              className="flex-1 text-sm"
            >
              {quitar.isPending ? 'Quitando…' : 'Sí, quitar'}
            </Boton>
          </div>
        </div>
      )}
    </li>
  );
}

/**
 * Un gasto más, escrito aquí mismo.
 *
 * Los gastos del día son siempre los mismos —luisma, jose, el carro, la
 * caleta—, así que la pantalla los ofrece ya escritos y basta con tocarlos.
 * Eso no es solo comodidad: teclearlos a mano cada vez es lo que produce
 * "Luisma", "luisma " y "Luizma" como tres gastos distintos, y ahí se acabó
 * cualquier reporte de en qué se va la plata.
 *
 * Un nombre que no está en la lista se puede crear, pero hay que confirmarlo:
 * así una errata de dedo no nace como categoría nueva sin que nadie la vea.
 *
 * Va al mismo sitio que los gastos de siempre (`/api/gastos`), con categoría
 * OTROS. Un segundo sitio donde guardar gastos habría partido el reporte del
 * mes en dos.
 */
function NuevoGasto({ dia, onListo }: { dia: string; onListo: () => void }) {
  const clienteDeQuery = useQueryClient();
  const [abierto, setAbierto] = useState(false);
  const [nombre, setNombre] = useState('');
  const [nuevoAceptado, setNuevoAceptado] = useState<string | null>(null);
  const [monto, setMonto] = useState('');
  const [moneda, setMoneda] = useState<Moneda>('VES');
  const [error, setError] = useState<string | null>(null);

  const conocidos = useQuery({
    queryKey: ['gastos', 'nombres'],
    queryFn: () => api<{ nombre: string; veces: number }[]>('/gastos/nombres'),
    enabled: abierto,
  });

  const lista = conocidos.data ?? [];
  const escrito = nombre.trim();
  const igual = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

  const sugerencias = escrito
    ? lista.filter((n) => n.nombre.toLowerCase().includes(escrito.toLowerCase()))
    : lista;

  const yaExiste = lista.some((n) => igual(n.nombre, escrito));
  const esNuevoSinConfirmar =
    escrito !== '' && !yaExiste && !(nuevoAceptado && igual(nuevoAceptado, escrito));

  const guardar = useMutation({
    mutationFn: () =>
      api('/gastos', {
        method: 'POST',
        body: JSON.stringify({
          // Los gastos que se anotan aquí son gente y cosas del día, no una
          // categoría contable: van todos a OTROS y el nombre es lo que importa.
          categoria: 'OTROS',
          descripcion: escrito,
          monto,
          moneda,
          fecha: dia === hoy() ? undefined : comoInstante(dia),
        }),
      }),
    onSuccess: () => {
      setNombre('');
      setNuevoAceptado(null);
      setMonto('');
      setError(null);
      // El nombre nuevo pasa a estar disponible para el siguiente.
      void clienteDeQuery.invalidateQueries({ queryKey: ['gastos', 'nombres'] });
      onListo();
      // El formulario se queda abierto: lo normal es anotar varios seguidos.
    },
    onError: (e: ApiError) => setError(e.message),
  });

  if (!abierto) {
    return (
      <Boton variante="secundario" onClick={() => setAbierto(true)} className="mt-3 w-full">
        + Añadir gasto
      </Boton>
    );
  }

  return (
    <div className="mt-3 space-y-3 rounded-lg border border-dashed border-slate-300 p-3 dark:border-slate-700">
      <Campo
        etiqueta="¿En qué se gastó?"
        valor={nombre}
        onChange={(v) => {
          setNombre(v);
          setError(null);
        }}
        placeholder="Luisma, el carro, la caleta…"
        autoFocus
      />

      {sugerencias.length > 0 && (
        <div className="-mx-1 flex flex-wrap gap-2 px-1">
          {sugerencias.slice(0, 12).map((sugerencia) => (
            <button
              key={sugerencia.nombre}
              type="button"
              onClick={() => {
                setNombre(sugerencia.nombre);
                setNuevoAceptado(null);
              }}
              className={[
                'min-h-[36px] rounded-full border px-3 text-sm',
                igual(sugerencia.nombre, escrito)
                  ? 'border-brand-600 bg-brand-600 font-semibold text-white'
                  : 'border-slate-300 dark:border-slate-700',
              ].join(' ')}
            >
              {sugerencia.nombre}
            </button>
          ))}
        </div>
      )}

      {esNuevoSinConfirmar && (
        <Aviso tono="atencion">
          <p>
            «{escrito}» no está en la lista. ¿Lo creas como gasto nuevo?
          </p>
          <Boton
            variante="secundario"
            onClick={() => setNuevoAceptado(escrito)}
            className="mt-2 w-full text-sm"
          >
            Sí, crear «{escrito}»
          </Boton>
        </Aviso>
      )}

      <CampoDinero etiqueta="Cuánto" valor={monto} onChange={setMonto} moneda={moneda} />

      <div className="grid grid-cols-3 gap-2">
        {MONEDAS.map((codigo) => (
          <button
            key={codigo}
            type="button"
            onClick={() => setMoneda(codigo)}
            aria-pressed={moneda === codigo}
            className={[
              'min-h-[44px] rounded-lg border text-sm font-semibold',
              moneda === codigo
                ? 'border-brand-600 bg-brand-600 text-white'
                : 'border-slate-300 dark:border-slate-700',
            ].join(' ')}
          >
            {codigo}
          </button>
        ))}
      </div>

      {error && <Aviso tono="error">{error}</Aviso>}

      <div className="flex gap-2">
        <Boton variante="secundario" onClick={() => setAbierto(false)} className="flex-1">
          Listo
        </Boton>
        <Boton
          onClick={() => guardar.mutate()}
          disabled={!escrito || !monto || esNuevoSinConfirmar || guardar.isPending}
          className="flex-1"
        >
          {guardar.isPending ? 'Guardando…' : 'Anotar gasto'}
        </Boton>
      </div>
    </div>
  );
}

/**
 * El cierre: lo que se contó de verdad y la observación.
 *
 * No se valida contra lo calculado a propósito. Si contó 20 mil menos, eso es un
 * dato —no un error que haya que impedir—: se guarda tal cual y la diferencia
 * queda a la vista para poder buscar de dónde salió.
 */
function FormularioCierre({
  informe,
  monedas,
  onListo,
}: {
  informe: InformeTodo;
  monedas: Moneda[];
  onListo: () => void;
}) {
  const [sobrante, setSobrante] = useState<Partial<Record<Moneda, string>>>({});
  const [observacion, setObservacion] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [guardado, setGuardado] = useState(false);

  // Al cambiar de día se recarga lo que ya estuviera cerrado, si lo hubiera.
  useEffect(() => {
    const valores: Partial<Record<Moneda, string>> = {};
    for (const m of MONEDAS) {
      const valor = informe.cierre?.sobrante[m];
      valores[m] = valor && valor !== '0' ? valor : '';
    }
    setSobrante(valores);
    setObservacion(informe.cierre?.observacion ?? '');
    setGuardado(false);
  }, [informe.dia, informe.cierre]);

  const guardar = useMutation({
    mutationFn: () =>
      api('/todo/cierre', {
        method: 'POST',
        body: JSON.stringify({
          dia: informe.dia,
          sobrante: Object.fromEntries(MONEDAS.map((m) => [m, sobrante[m] || '0'])),
          observacion,
        }),
      }),
    onSuccess: () => {
      setGuardado(true);
      setError(null);
      onListo();
    },
    onError: (e: ApiError) => setError(e.message),
  });

  /** Lo contado menos lo que debería haber, en vivo mientras se escribe. */
  const diferencia = (m: Moneda) =>
    D(sobrante[m] || '0').minus(D(informe.deberiaQuedar[m]));

  return (
    <Tarjeta titulo="Wilmer me queda debiendo hoy">
      <p className="mb-3 text-xs opacity-60">
        Cuenta el dinero y escribe lo que hay de verdad. Ese sobrante es con lo que arrancas
        mañana.
      </p>

      <div className="space-y-3">
        {monedas.map((m) => {
          const escrito = (sobrante[m] ?? '').trim() !== '';
          const dif = diferencia(m);

          return (
            <div key={m}>
              <CampoDinero
                etiqueta={`${NOMBRE[m]} contados`}
                valor={sobrante[m] ?? ''}
                onChange={(v) => setSobrante((previo) => ({ ...previo, [m]: v }))}
                moneda={m}
                placeholder={informe.deberiaQuedar[m]}
              />
              {escrito && !dif.isZero() && (
                <p
                  className={`tabular mt-1 text-xs ${dif.isNegative() ? 'text-rose-600 dark:text-rose-400' : 'text-amber-600 dark:text-amber-400'}`}
                >
                  {dif.isNegative() ? 'Faltan' : 'Sobran'}{' '}
                  {formatMoney(money(dif.abs().toString(), m))} respecto a lo calculado.
                </p>
              )}
            </div>
          );
        })}

        <label className="block">
          <span className="text-xs font-medium opacity-70">Observación</span>
          <textarea
            value={observacion}
            onChange={(evento) => setObservacion(evento.target.value)}
            rows={3}
            placeholder="Qué pasó hoy, qué quedó pendiente, de dónde salió la diferencia…"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
          />
        </label>

        {error && <Aviso tono="error">{error}</Aviso>}
        {guardado && (
          <Aviso tono="bien">
            Cierre guardado. Mañana arrancas contando esto como saldo del día anterior.
          </Aviso>
        )}

        <Boton
          onClick={() => guardar.mutate()}
          disabled={guardar.isPending}
          className="w-full"
        >
          {guardar.isPending
            ? 'Guardando…'
            : informe.cierre
              ? 'Actualizar el cierre'
              : 'Guardar el cierre del día'}
        </Boton>
      </div>
    </Tarjeta>
  );
}
