import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  D,
  MONEDAS,
  conUnidad,
  crearImporte,
  formatMoney,
  money,
  plural,
  type Moneda,
  type TasaDelDia,
} from '@geovanny/shared';
import type { ApiError } from '../../lib/api';
import { api } from '../../lib/api';
import { Aviso, Boton, Campo, Cargando, Tarjeta, Vacio } from '../../components/ui/base';
import { CampoFecha, comoInstante, hoy } from '../../components/ui/CampoFecha';
import { SelectorCaja } from '../cajas/SelectorCaja';
import { useAuth } from '../auth/AuthContext';
import type { CorteVentasTotales, Producto, ResultadoLote } from '../../lib/tipos';

/**
 * Ventas totales: lo que se despacha en el mostrador, sin cliente.
 *
 * La pantalla está hecha para el ritmo real de un día de venta: arriba lo que
 * hay, se toca un producto y abajo aparece su renglón listo para escribir
 * cantidad y precio. Se puede guardar renglón por renglón —según se va
 * despachando— o todos de golpe al final. Nunca se sale de esta pantalla.
 */

interface Linea {
  clave: number;
  productoId: string;
  nombre: string;
  unidad: string;
  stock: string;
  cantidad: string;
  precio: string;
  estado: 'PENDIENTE' | 'GUARDANDO' | 'GUARDADA' | 'ERROR';
  numero?: string;
  error?: string;
  codigoError?: string;
  /** Se activa solo si el usuario confirma vender sin existencias (RP-14). */
  forzar?: boolean;
}

const nuevaLinea = (clave: number, producto: Producto): Linea => ({
  clave,
  productoId: producto.id,
  nombre: producto.nombre,
  unidad: producto.unidad,
  stock: producto.stock,
  cantidad: '',
  // Se propone el precio habitual del producto; siempre se puede cambiar.
  precio: producto.precioVenta !== '0' ? producto.precioVenta : '',
  estado: 'PENDIENTE',
});

export function VentasTotales() {
  const clienteDeQuery = useQueryClient();
  const { puede } = useAuth();

  const [dia, setDia] = useState(hoy());
  const [moneda, setMoneda] = useState<Moneda>('VES');
  const [cajaId, setCajaId] = useState('');
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);

  const siguienteClave = useRef(1);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const ultimaRef = useRef<HTMLLIElement | null>(null);

  const productos = useQuery({
    queryKey: ['productos', ''],
    queryFn: () => api<Producto[]>('/productos'),
  });

  const corte = useQuery({
    queryKey: ['ventas-totales', dia],
    queryFn: () => api<CorteVentasTotales>(`/ventas-totales?dia=${dia}`),
  });

  // La tasa sirve solo para adelantar en pantalla a cuánto equivale lo que
  // todavía no se ha guardado. Lo guardado lleva su propia tasa congelada.
  const tasa = useQuery({
    queryKey: ['tasas'],
    queryFn: () => api<{ vigente: TasaDelDia | null }>('/tasas'),
  });

  const pendientes = lineas.filter((l) => l.estado !== 'GUARDADA');
  const listasParaGuardar = pendientes.filter(
    (l) => D(l.cantidad || '0').greaterThan(0) && D(l.precio || '0').greaterThan(0),
  );

  const totalPendiente = useMemo(
    () =>
      listasParaGuardar
        .reduce((acc, l) => acc.plus(D(l.cantidad).times(D(l.precio))), D(0))
        .toString(),
    [listasParaGuardar],
  );

  const equivalentePendiente = useMemo(() => {
    const vigente = tasa.data?.vigente;
    if (!vigente || D(totalPendiente).isZero()) return null;
    return crearImporte(totalPendiente, moneda, vigente).eq;
  }, [tasa.data, totalPendiente, moneda]);

  function agregar(producto: Producto) {
    const clave = siguienteClave.current++;
    setLineas((previas) => [...previas, nuevaLinea(clave, producto)]);
    setErrorGeneral(null);
    // "Toco el producto y me lleva abajo a llenarlo": el desplazamiento ocurre
    // tras pintar el renglón nuevo, por eso el salto al siguiente ciclo.
    requestAnimationFrame(() => {
      (ultimaRef.current ?? panelRef.current)?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    });
  }

  const cambiar = (clave: number, cambios: Partial<Linea>) =>
    setLineas((previas) =>
      previas.map((l) =>
        l.clave === clave ? { ...l, ...cambios, ...(cambios.estado ? {} : { error: undefined }) } : l,
      ),
    );

  const cuerpoDe = (linea: Linea) => ({
    productoId: linea.productoId,
    cantidad: linea.cantidad,
    precio: linea.precio,
    moneda,
    cajaId: cajaId || null,
    fecha: dia === hoy() ? undefined : comoInstante(dia),
    forzar: linea.forzar === true,
  });

  const terminado = () => {
    void clienteDeQuery.invalidateQueries();
  };

  /** Guarda un renglón suelto: así se va despachando de uno en uno. */
  const guardarUna = useMutation({
    mutationFn: async (linea: Linea) => {
      cambiar(linea.clave, { estado: 'GUARDANDO' });
      return api<{ numero: string }>('/ventas-totales', {
        method: 'POST',
        body: JSON.stringify(cuerpoDe(linea)),
      });
    },
    onSuccess: (venta, linea) => {
      cambiar(linea.clave, { estado: 'GUARDADA', numero: venta.numero });
      terminado();
    },
    onError: (e: ApiError, linea) => {
      cambiar(linea.clave, { estado: 'ERROR', error: e.message, codigoError: e.code });
    },
  });

  /** Guarda todas las que estén completas. Las que fallen lo dicen y se quedan. */
  const guardarTodas = useMutation({
    mutationFn: async () => {
      const enviadas = listasParaGuardar;
      setLineas((previas) =>
        previas.map((l) =>
          enviadas.some((e) => e.clave === l.clave) ? { ...l, estado: 'GUARDANDO' } : l,
        ),
      );
      const resultado = await api<ResultadoLote>('/ventas-totales/lote', {
        method: 'POST',
        body: JSON.stringify({ lineas: enviadas.map(cuerpoDe) }),
      });
      return { resultado, enviadas };
    },
    onSuccess: ({ resultado, enviadas }) => {
      setLineas((previas) =>
        previas.map((linea) => {
          const indice = enviadas.findIndex((e) => e.clave === linea.clave);
          if (indice === -1) return linea;

          const ok = resultado.guardadas.find((g) => g.indice === indice);
          if (ok) return { ...linea, estado: 'GUARDADA' as const, numero: ok.numero };

          const fallo = resultado.fallidas.find((f) => f.indice === indice);
          return {
            ...linea,
            estado: 'ERROR' as const,
            error: fallo?.mensaje,
            codigoError: fallo?.codigo,
          };
        }),
      );
      if (resultado.fallidas.length > 0) {
        setErrorGeneral(
          `Se guardaron ${resultado.guardadas.length} de ${enviadas.length}. Revisa las que quedaron marcadas.`,
        );
      }
      terminado();
    },
    onError: (e: ApiError) => {
      setLineas((previas) =>
        previas.map((l) => (l.estado === 'GUARDANDO' ? { ...l, estado: 'PENDIENTE' } : l)),
      );
      setErrorGeneral(e.message);
    },
  });

  const anular = useMutation({
    mutationFn: (id: string) =>
      api(`/ventas-totales/${id}/anular`, {
        method: 'POST',
        body: JSON.stringify({ motivo: 'Registro equivocado' }),
      }),
    onSuccess: terminado,
    onError: (e: ApiError) => setErrorGeneral(e.message),
  });

  if (productos.isLoading) return <Cargando />;

  const catalogo = productos.data ?? [];
  const guardando = guardarTodas.isPending || guardarUna.isPending;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">Ventas totales</h1>
        <p className="text-xs opacity-60">
          Lo que se vende en el mostrador y se cobra en el momento. No hace falta cliente.
        </p>
      </div>

      <div className="flex items-center justify-between gap-3">
        <CampoFecha valor={dia} onChange={setDia} etiqueta="¿De qué día son estas ventas?" />
      </div>

      {catalogo.length === 0 ? (
        <Vacio
          mensaje="No hay productos que vender todavía."
          accion={
            <Link to="/inventario">
              <Boton>Crear productos</Boton>
            </Link>
          }
        />
      ) : (
        <Tarjeta titulo="Toca lo que vendiste">
          <ul className="grid grid-cols-2 gap-2">
            {catalogo.map((producto) => {
              const enLista = lineas.filter(
                (l) => l.productoId === producto.id && l.estado !== 'GUARDADA',
              ).length;

              return (
                <li key={producto.id}>
                  <button
                    type="button"
                    onClick={() => agregar(producto)}
                    className="flex min-h-[64px] w-full flex-col justify-center rounded-lg border border-slate-300 px-3 py-2 text-left transition active:scale-[0.98] dark:border-slate-700"
                  >
                    <span className="flex items-center gap-1.5">
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                        {producto.nombre}
                      </span>
                      {enLista > 0 && (
                        <span className="bg-brand-600 shrink-0 rounded-full px-1.5 text-[11px] font-bold text-white">
                          {enLista}
                        </span>
                      )}
                    </span>
                    <span
                      className={`tabular text-xs ${D(producto.stock).greaterThan(0) ? 'opacity-60' : 'text-amber-600 dark:text-amber-400'}`}
                    >
                      {conUnidad(producto.stock, producto.unidad)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </Tarjeta>
      )}

      <div ref={panelRef} className="scroll-mt-24">
        {lineas.length > 0 && (
          <Tarjeta titulo={`Registros (${lineas.length})`}>
            <div className="mb-3">
              <p className="mb-1 text-xs font-medium opacity-70">¿En qué moneda vendiste?</p>
              <div className="grid grid-cols-3 gap-2">
                {MONEDAS.map((codigo) => (
                  <button
                    key={codigo}
                    type="button"
                    onClick={() => setMoneda(codigo)}
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
              <div className="mt-2">
                <SelectorCaja moneda={moneda} valor={cajaId} onChange={setCajaId} />
              </div>
            </div>

            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {lineas.map((linea, indice) => (
                <RenglonVenta
                  key={linea.clave}
                  ref={indice === lineas.length - 1 ? ultimaRef : undefined}
                  linea={linea}
                  moneda={moneda}
                  onCambiar={(cambios) => cambiar(linea.clave, cambios)}
                  onQuitar={() =>
                    setLineas((previas) => previas.filter((l) => l.clave !== linea.clave))
                  }
                  onGuardar={() => guardarUna.mutate(linea)}
                  onForzar={() => {
                    const forzada = { ...linea, forzar: true, estado: 'PENDIENTE' as const };
                    cambiar(linea.clave, forzada);
                    guardarUna.mutate(forzada);
                  }}
                />
              ))}
            </ul>

            {errorGeneral && (
              <div className="mt-3">
                <Aviso tono="error">{errorGeneral}</Aviso>
              </div>
            )}

            {listasParaGuardar.length > 1 && (
              <Boton
                onClick={() => guardarTodas.mutate()}
                disabled={guardando}
                className="mt-3 w-full"
              >
                {guardarTodas.isPending
                  ? 'Guardando…'
                  : `Guardar las ${listasParaGuardar.length} de una vez`}
              </Boton>
            )}

            {pendientes.length === 0 && lineas.length > 0 && (
              <Boton
                variante="suave"
                onClick={() => setLineas([])}
                className="mt-3 w-full"
              >
                Listo, limpiar la lista
              </Boton>
            )}
          </Tarjeta>
        )}
      </div>

      {/* El corte del día: es la cifra que él busca al cerrar. */}
      <div className="safe-bottom sticky bottom-20 rounded-xl border border-slate-200 bg-white p-4 shadow-lg dark:border-slate-800 dark:bg-slate-900">
        {listasParaGuardar.length > 0 && (
          <div className="mb-3 border-b border-dashed border-slate-200 pb-3 dark:border-slate-700">
            <div className="flex items-baseline justify-between">
              <span className="text-xs opacity-60">Sin guardar ({listasParaGuardar.length})</span>
              <span className="tabular text-lg font-semibold">
                {formatMoney(money(totalPendiente, moneda))}
              </span>
            </div>
            {equivalentePendiente && (
              <p className="tabular text-xs opacity-60">
                {MONEDAS.filter((m) => m !== moneda)
                  .map((m) => formatMoney(money(equivalentePendiente[m], m)))
                  .join(' · ')}
              </p>
            )}
          </div>
        )}

        <p className="text-xs tracking-wide uppercase opacity-50">
          {corte.data?.esHoy ? 'Vendido hoy de mostrador' : `Vendido el ${dia}`}
        </p>

        {corte.isLoading ? (
          <p className="mt-1 text-sm opacity-60">Sumando…</p>
        ) : (
          <>
            <div className="mt-1 grid grid-cols-2 gap-2">
              {(['USD', 'VES'] as const).map((m) => (
                <div key={m}>
                  <p className="text-[11px] uppercase opacity-50">{m === 'USD' ? 'Dólares' : 'Bolívares'}</p>
                  <p className="tabular text-xl font-bold">
                    {formatMoney(money(corte.data?.totales.porMoneda[m] ?? '0', m))}
                  </p>
                </div>
              ))}
            </div>
            <p className="tabular mt-2 text-xs opacity-60">
              {formatMoney(money(corte.data?.totales.porMoneda.COP ?? '0', 'COP'))} ·{' '}
              {corte.data?.totales.unidades ?? '0'} en total ·{' '}
              {corte.data?.totales.registros ?? 0}{' '}
              {corte.data?.totales.registros === 1 ? 'registro' : 'registros'}
            </p>
          </>
        )}
      </div>

      {(corte.data?.porProducto.length ?? 0) > 0 && (
        <Tarjeta titulo="Cuánto salió de cada producto">
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {corte.data!.porProducto.map((fila) => (
              <li key={fila.nombre} className="flex items-baseline justify-between gap-3 py-2">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{fila.nombre}</span>
                  <span className="tabular text-xs opacity-60">
                    {conUnidad(fila.cantidad, fila.unidad)}
                  </span>
                </span>
                <span className="tabular shrink-0 text-right text-sm">
                  <span className="block">{formatMoney(money(fila.totalPorMoneda.USD, 'USD'))}</span>
                  <span className="block text-xs opacity-60">
                    {formatMoney(money(fila.totalPorMoneda.VES, 'VES'))}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </Tarjeta>
      )}

      {(corte.data?.ventas.length ?? 0) > 0 && (
        <Tarjeta titulo="Registro por registro">
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {corte.data!.ventas.map((venta) => (
              <li key={venta.id} className="flex items-center gap-2 py-2">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {venta.items.map((i) => `${i.cantidad} ${i.nombre.toLowerCase()}`).join(' · ')}
                  </span>
                  <span className="tabular text-xs opacity-50">
                    {venta.numero} · {venta.hora}
                  </span>
                </span>
                <span className="tabular shrink-0 text-sm">
                  {formatMoney(money(venta.total.monto, venta.moneda))}
                </span>
                {puede('sale:void') && (
                  <button
                    type="button"
                    aria-label={`Eliminar el registro ${venta.numero}`}
                    onClick={() => anular.mutate(venta.id)}
                    disabled={anular.isPending}
                    className="px-1 text-lg opacity-40 hover:opacity-100"
                  >
                    ✕
                  </button>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs opacity-50">
            Eliminar un registro devuelve la mercancía al inventario y saca la plata de la caja.
          </p>
        </Tarjeta>
      )}
    </div>
  );
}

/** Un renglón: producto, cuánto salió y a cómo. Nada más. */
function RenglonVenta({
  ref,
  linea,
  moneda,
  onCambiar,
  onQuitar,
  onGuardar,
  onForzar,
}: {
  ref?: React.Ref<HTMLLIElement>;
  linea: Linea;
  moneda: Moneda;
  onCambiar: (cambios: Partial<Linea>) => void;
  onQuitar: () => void;
  onGuardar: () => void;
  onForzar: () => void;
}) {
  const completa = D(linea.cantidad || '0').greaterThan(0) && D(linea.precio || '0').greaterThan(0);
  const subtotal = completa ? D(linea.cantidad).times(D(linea.precio)).toString() : '0';
  const pasaDelStock = D(linea.cantidad || '0').greaterThan(D(linea.stock));

  if (linea.estado === 'GUARDADA') {
    return (
      <li ref={ref} className="flex items-center justify-between gap-2 py-2">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium opacity-60 line-through">
            {linea.nombre}
          </span>
          <span className="text-xs text-emerald-700 dark:text-emerald-400">
            Guardada · {linea.numero}
          </span>
        </span>
        <span className="tabular shrink-0 text-sm opacity-60">
          {formatMoney(money(subtotal, moneda))}
        </span>
      </li>
    );
  }

  return (
    <li ref={ref} className="scroll-mt-24 space-y-2 py-3">
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 truncate font-semibold">{linea.nombre}</p>
        <button
          type="button"
          aria-label={`Quitar ${linea.nombre}`}
          onClick={onQuitar}
          className="shrink-0 px-2 text-lg opacity-40"
        >
          ✕
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Campo
          etiqueta={`Cuántos ${plural(linea.unidad, 2).toLowerCase()}`}
          valor={linea.cantidad}
          onChange={(v) => onCambiar({ cantidad: v })}
          numerico
          autoFocus
        />
        <Campo
          etiqueta={`Precio por ${linea.unidad.toLowerCase()}`}
          valor={linea.precio}
          onChange={(v) => onCambiar({ precio: v })}
          numerico
        />
      </div>

      <div className="flex items-center justify-between gap-2">
        <span className="tabular text-sm">
          {completa ? (
            <>
              <span className="opacity-60">Sale en </span>
              <strong>{formatMoney(money(subtotal, moneda))}</strong>
            </>
          ) : (
            <span className="opacity-50">Falta la cantidad y el precio</span>
          )}
        </span>
        <Boton
          variante="secundario"
          onClick={onGuardar}
          disabled={!completa || linea.estado === 'GUARDANDO'}
          className="shrink-0 px-5 text-sm"
        >
          {linea.estado === 'GUARDANDO' ? 'Guardando…' : 'Guardar'}
        </Boton>
      </div>

      {pasaDelStock && linea.estado !== 'ERROR' && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          Solo figuran {conUnidad(linea.stock, linea.unidad)} en el inventario.
        </p>
      )}

      {linea.estado === 'ERROR' && linea.error && (
        <Aviso tono="error">
          {linea.error}
          {/* Sin existencias no se para una venta que ya ocurrió: se avisa y se
              deja registrar, igual que en la pantalla de vender (RP-14). */}
          {linea.codigoError === 'SIN_STOCK' && (
            <Boton variante="peligro" onClick={onForzar} className="mt-2 w-full text-sm">
              Registrar igual (queda en negativo)
            </Boton>
          )}
        </Aviso>
      )}
    </li>
  );
}
