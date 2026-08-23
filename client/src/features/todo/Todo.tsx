import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { D, MONEDAS, conUnidad, formatMoney, money, type Moneda } from '@geovanny/shared';
import type { ApiError } from '../../lib/api';
import { api } from '../../lib/api';
import { Aviso, Boton, Campo, Cargando, Seleccion, Tarjeta, Vacio } from '../../components/ui/base';
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
              {informe.ventas.porProducto.map((fila) => {
                const enMonedas = MONEDAS.filter((m) => !D(fila.vendido[m]).isZero());
                return (
                  <li key={fila.nombre} className="flex items-start justify-between gap-3 py-2.5">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold">{fila.nombre}</span>
                      <span className="tabular text-xs opacity-60">
                        {conUnidad(fila.cantidad, fila.unidad)} en {fila.registros}{' '}
                        {fila.registros === 1 ? 'venta' : 'ventas'}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      {enMonedas.map((m) => (
                        <span key={m} className="tabular block text-sm font-semibold">
                          {formatMoney(money(fila.vendido[m], m))}
                        </span>
                      ))}
                    </span>
                  </li>
                );
              })}
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
          ayuda={informe.vieneDeAntes.observacion ?? 'Sin cierre anterior: arranca en cero'}
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
              <li key={gasto.id} className="flex items-center justify-between gap-3 py-2">
                <span className="min-w-0">
                  <span className="block truncate text-sm">
                    {gasto.descripcion || gasto.categoria.toLowerCase()}
                  </span>
                  <span className="text-xs opacity-50">
                    {gasto.categoria.toLowerCase()} · {gasto.hora}
                  </span>
                </span>
                <span className="tabular shrink-0 text-sm">
                  − {formatMoney(money(gasto.monto, gasto.moneda))}
                </span>
              </li>
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

      <FormularioCierre informe={informe} monedas={monedas} onListo={refrescar} />
    </div>
  );
}

/**
 * Un gasto más, escrito aquí mismo.
 *
 * Va al mismo sitio que los gastos de siempre (`/api/gastos`), así que sale en
 * el resumen del mes y descuenta de la caja. Un segundo sitio donde guardar
 * gastos habría partido el reporte en dos.
 */
function NuevoGasto({ dia, onListo }: { dia: string; onListo: () => void }) {
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [monto, setMonto] = useState('');
  const [moneda, setMoneda] = useState<Moneda>('VES');
  const [categoria, setCategoria] = useState('OTROS');
  const [error, setError] = useState<string | null>(null);

  const guardar = useMutation({
    mutationFn: () =>
      api('/gastos', {
        method: 'POST',
        body: JSON.stringify({
          categoria,
          descripcion: motivo.trim(),
          monto,
          moneda,
          fecha: dia === hoy() ? undefined : comoInstante(dia),
        }),
      }),
    onSuccess: () => {
      setMotivo('');
      setMonto('');
      setError(null);
      onListo();
      // Se queda abierto: lo normal es anotar varios seguidos.
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
        valor={motivo}
        onChange={setMotivo}
        placeholder="Gasolina, almuerzo, peaje…"
        autoFocus
      />
      <div className="grid grid-cols-2 gap-3">
        <Campo etiqueta="Cuánto" valor={monto} onChange={setMonto} numerico />
        <Seleccion
          etiqueta="Categoría"
          valor={categoria}
          onChange={setCategoria}
          opciones={CATEGORIAS.map((c) => ({ valor: c, texto: c.toLowerCase() }))}
        />
      </div>

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
          disabled={!motivo.trim() || !monto || guardar.isPending}
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
    <Tarjeta titulo="Cierre del día">
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
              <Campo
                etiqueta={`${NOMBRE[m]} contados`}
                valor={sobrante[m] ?? ''}
                onChange={(v) => setSobrante((previo) => ({ ...previo, [m]: v }))}
                numerico
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
