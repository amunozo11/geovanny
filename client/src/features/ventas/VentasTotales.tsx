import { useEffect, useMemo, useRef, useState } from 'react';
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
import { CampoDinero } from '../../components/ui/CampoDinero';
import { CampoFecha, TiraDeDias, comoInstante, etiquetaDia, hoy } from '../../components/ui/CampoFecha';
import { SelectorCaja } from '../cajas/SelectorCaja';
import { useAuth } from '../auth/AuthContext';
import { useMoneda } from '../moneda/contexto';
import type { CorteVentasTotales, Producto, ResultadoLote } from '../../lib/tipos';

/**
 * Ventas totales: lo que se despacha en el mostrador, sin cliente.
 *
 * La pantalla está hecha para el ritmo real de un día de venta: arriba lo que
 * hay, se toca un producto y abajo aparece su renglón listo para escribir
 * cantidad, precio y en qué moneda se cobró. Se puede guardar renglón por
 * renglón —según se va despachando— o todos de golpe al final, sin salir de
 * aquí.
 *
 * Los renglones se agrupan por producto, bajo su encabezado: vender papa cinco
 * veces en la mañana es lo normal, y obligar a subir a la cuadrícula y volver a
 * bajar cada vez sería el peor camino posible. Dentro de cada grupo hay un
 * "añadir otra" que deja el siguiente renglón justo debajo.
 *
 * La moneda es **de cada registro, no de la tanda**: en el mostrador una venta
 * se cobra en bolívares y la siguiente en dólares, y no se va a cambiar un
 * selector global entre una y otra.
 */

interface Linea {
  clave: number;
  productoId: string;
  nombre: string;
  unidad: string;
  stock: string;
  cantidad: string;
  precio: string;
  moneda: Moneda;
  estado: 'PENDIENTE' | 'GUARDANDO' | 'GUARDADA' | 'ERROR';
  numero?: string;
  error?: string;
  codigoError?: string;
  /** Se activa solo si el usuario confirma vender sin existencias (RP-14). */
  forzar?: boolean;
}

interface Grupo {
  productoId: string;
  nombre: string;
  unidad: string;
  stock: string;
  lineas: Linea[];
}

const NOMBRE_MONEDA: Record<Moneda, string> = {
  COP: 'pesos',
  USD: 'dólares',
  VES: 'bolívares',
};

const enCero = (): Record<Moneda, string> =>
  Object.fromEntries(MONEDAS.map((m) => [m, '0'])) as Record<Moneda, string>;

const subtotalDe = (linea: Linea): string =>
  D(linea.cantidad || '0')
    .times(D(linea.precio || '0'))
    .toString();

/** Suma un conjunto de renglones dejando cada moneda en su propia casilla. */
function porMoneda(lineas: Linea[]): Record<Moneda, string> {
  const total = enCero();
  for (const linea of lineas) {
    total[linea.moneda] = D(total[linea.moneda]).plus(D(subtotalDe(linea))).toString();
  }
  return total;
}

/** "US$ 20,00 · Bs. 4.000,00" — solo las monedas que tienen algo. */
function comoTexto(total: Record<Moneda, string>): string {
  const conAlgo = MONEDAS.filter((m) => !D(total[m]).isZero());
  if (conAlgo.length === 0) return '—';
  return conAlgo.map((m) => formatMoney(money(total[m], m))).join(' · ');
}

export function VentasTotales() {
  const clienteDeQuery = useQueryClient();
  const { puede } = useAuth();
  /** La moneda del selector de arriba: solo para el "todo junto vale…". */
  const { moneda } = useMoneda();

  const [dia, setDia] = useState(hoy());
  /** Moneda que se propone en el renglón siguiente: la última que se usó. */
  const [ultimaMoneda, setUltimaMoneda] = useState<Moneda>('VES');
  const [cajaPorMoneda, setCajaPorMoneda] = useState<Partial<Record<Moneda, string>>>({});
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  /** El último renglón añadido: se enfoca y se trae a la vista. */
  const [recienAgregada, setRecienAgregada] = useState<number | null>(null);

  const siguienteClave = useRef(1);
  const refRecien = useRef<HTMLLIElement | null>(null);

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

  // `nearest` mueve lo mínimo imprescindible: si el renglón nuevo apareció
  // justo debajo del dedo, la pantalla casi no se mueve; si estaba fuera de
  // vista, baja solo lo justo para enseñarlo.
  useEffect(() => {
    if (recienAgregada === null) return;
    refRecien.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [recienAgregada]);

  const pendientes = lineas.filter((l) => l.estado !== 'GUARDADA');
  const listasParaGuardar = pendientes.filter(
    (l) => D(l.cantidad || '0').greaterThan(0) && D(l.precio || '0').greaterThan(0),
  );

  /** Un bloque por producto, en el orden en que se fueron tocando. */
  const grupos = useMemo(() => {
    const agrupado = new Map<string, Grupo>();
    for (const linea of lineas) {
      const grupo = agrupado.get(linea.productoId);
      if (grupo) grupo.lineas.push(linea);
      else
        agrupado.set(linea.productoId, {
          productoId: linea.productoId,
          nombre: linea.nombre,
          unidad: linea.unidad,
          stock: linea.stock,
          lineas: [linea],
        });
    }
    return [...agrupado.values()];
  }, [lineas]);

  const totalPendiente = useMemo(() => porMoneda(pendientes), [pendientes]);

  /** Lo pendiente, convertido a las tres monedas con la tasa de hoy. */
  const equivalentePendiente = useMemo(() => {
    const vigente = tasa.data?.vigente;
    if (!vigente) return null;

    const acumulado = enCero();
    for (const linea of listasParaGuardar) {
      const importe = crearImporte(subtotalDe(linea), linea.moneda, vigente);
      for (const m of MONEDAS) {
        acumulado[m] = D(acumulado[m]).plus(D(importe.eq[m])).toString();
      }
    }
    return acumulado;
  }, [tasa.data, listasParaGuardar]);

  /** Las monedas que hay ahora mismo sobre la mesa, para pedir su caja. */
  const monedasEnUso = MONEDAS.filter((m) => pendientes.some((l) => l.moneda === m));

  /**
   * Añade un renglón de un producto.
   *
   * Si ya hay renglones de ese producto se heredan precio y moneda del último:
   * quien despacha papa cinco veces la vende casi siempre igual, y volver a
   * teclearlo cada vez es trabajo regalado.
   */
  function agregar(producto: {
    id: string;
    nombre: string;
    unidad: string;
    stock: string;
    precioVenta?: string;
    monedaVenta?: Moneda;
  }) {
    const clave = siguienteClave.current++;
    setLineas((previas) => {
      const ultimaDelMismo = [...previas].reverse().find((l) => l.productoId === producto.id);
      return [
        ...previas,
        {
          clave,
          productoId: producto.id,
          nombre: producto.nombre,
          unidad: producto.unidad,
          stock: producto.stock,
          cantidad: '',
          precio:
            ultimaDelMismo?.precio ??
            (producto.precioVenta && producto.precioVenta !== '0' ? producto.precioVenta : ''),
          moneda: ultimaDelMismo?.moneda ?? producto.monedaVenta ?? ultimaMoneda,
          estado: 'PENDIENTE',
        },
      ];
    });
    setRecienAgregada(clave);
    setErrorGeneral(null);
  }

  const cambiar = (clave: number, cambios: Partial<Linea>) => {
    if (cambios.moneda) setUltimaMoneda(cambios.moneda);
    setLineas((previas) =>
      previas.map((l) =>
        l.clave === clave
          ? { ...l, ...cambios, ...(cambios.estado ? {} : { error: undefined }) }
          : l,
      ),
    );
  };

  const cuerpoDe = (linea: Linea) => ({
    productoId: linea.productoId,
    cantidad: linea.cantidad,
    precio: linea.precio,
    moneda: linea.moneda,
    cajaId: cajaPorMoneda[linea.moneda] || null,
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
  const esHoy = dia === hoy();

  // Solo se enseñan las monedas en las que de verdad se cobró algo ese día.
  // Un "$ 0" al lado de las cifras buenas es ruido que hay que leer y descartar.
  const conCobro = MONEDAS.filter((m) => !D(corte.data?.totales.cobrado[m] ?? '0').isZero());
  const monedasCobradas: Moneda[] = conCobro.length > 0 ? conCobro : ['USD', 'VES'];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">Ventas totales</h1>
        <p className="text-xs opacity-60">
          Lo que se vende en el mostrador y se cobra en el momento. No hace falta cliente.
        </p>
      </div>

      <CampoFecha valor={dia} onChange={setDia} etiqueta="¿De qué día son estas ventas?" />

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

      {lineas.length > 0 && (
        <Tarjeta titulo={`Registros (${lineas.length})`}>
          <div className="space-y-3">
            {grupos.map((grupo) => (
              <GrupoProducto
                key={grupo.productoId}
                grupo={grupo}
                claveNueva={recienAgregada}
                refNueva={refRecien}
                onAgregarOtra={() => agregar({ ...grupo, id: grupo.productoId })}
                onCambiar={cambiar}
                onQuitar={(clave) =>
                  setLineas((previas) => previas.filter((l) => l.clave !== clave))
                }
                onGuardar={(linea) => guardarUna.mutate(linea)}
                onForzar={(linea) => {
                  const forzada = { ...linea, forzar: true, estado: 'PENDIENTE' as const };
                  cambiar(linea.clave, forzada);
                  guardarUna.mutate(forzada);
                }}
              />
            ))}
          </div>

          {/* Una caja por cada moneda que haya sobre la mesa. Si no hay cajas
              creadas en esa moneda, el selector desaparece solo. */}
          {monedasEnUso.length > 0 && (
            <div className="mt-3 space-y-2 border-t border-slate-100 pt-3 dark:border-slate-800">
              {monedasEnUso.map((m) => (
                <SelectorCaja
                  key={m}
                  moneda={m}
                  valor={cajaPorMoneda[m] ?? ''}
                  onChange={(caja) => setCajaPorMoneda((previo) => ({ ...previo, [m]: caja }))}
                  etiqueta={`¿Dónde entran los ${m}?`}
                />
              ))}
            </div>
          )}

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

          {pendientes.length === 0 && (
            <Boton variante="suave" onClick={() => setLineas([])} className="mt-3 w-full">
              Listo, limpiar la lista
            </Boton>
          )}
        </Tarjeta>
      )}

      {/* El corte del día: es la cifra que él busca al cerrar. */}
      <div className="safe-bottom sticky bottom-20 rounded-xl border border-slate-200 bg-white p-4 shadow-lg dark:border-slate-800 dark:bg-slate-900">
        {listasParaGuardar.length > 0 && (
          <div className="mb-3 border-b border-dashed border-slate-200 pb-3 dark:border-slate-700">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-xs opacity-60">Sin guardar ({listasParaGuardar.length})</span>
              <span className="tabular text-right text-sm font-semibold">
                {comoTexto(totalPendiente)}
              </span>
            </div>
            {equivalentePendiente && (
              <p className="tabular text-right text-xs opacity-60">
                = {formatMoney(money(equivalentePendiente.USD, 'USD'))} ·{' '}
                {formatMoney(money(equivalentePendiente.VES, 'VES'))}
              </p>
            )}
          </div>
        )}

        <p className="text-xs tracking-wide uppercase opacity-50">
          {esHoy
            ? 'Cobrado hoy en el mostrador'
            : `Cobrado el ${etiquetaDia(dia).toLowerCase()} ${dia}`}
        </p>

        {corte.isLoading ? (
          <p className="mt-1 text-sm opacity-60">Sumando…</p>
        ) : (
          <>
            {/* Lo que entró EN CADA MONEDA, que es plata distinta: los dólares
                están en un bolsillo y los bolívares en otro. El equivalente
                —el mismo dinero convertido— va debajo y en pequeño, porque
                enseñarlo arriba hace creer que se vendió el doble. */}
            <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-2">
              {monedasCobradas.map((m) => (
                <div key={m}>
                  <p className="text-[11px] uppercase opacity-50">En {NOMBRE_MONEDA[m]}</p>
                  <p className="tabular text-xl font-bold">
                    {formatMoney(money(corte.data?.totales.cobrado[m] ?? '0', m))}
                  </p>
                </div>
              ))}
            </div>
            <p className="tabular mt-2 text-xs opacity-60">
              {corte.data?.totales.unidades ?? '0'} en total ·{' '}
              {corte.data?.totales.registros ?? 0}{' '}
              {corte.data?.totales.registros === 1 ? 'registro' : 'registros'}
              {(corte.data?.totales.registros ?? 0) > 0 && (
                <> · todo junto vale {formatMoney(money(corte.data!.totales.porMoneda[moneda], moneda))}</>
              )}
            </p>
          </>
        )}
      </div>

      {/* El negocio se lleva por días, así que el día se elige aquí abajo,
          justo encima de lo que se está mirando, sin volver arriba. */}
      <Tarjeta titulo="Qué día estás viendo">
        <TiraDeDias valor={dia} onChange={setDia} />
        <p className="mt-2 text-xs opacity-60">
          {esHoy
            ? 'Los registros nuevos se guardan en el día de hoy.'
            : `Ojo: mientras esté marcado este día, los registros nuevos se guardan con fecha ${dia}.`}
        </p>
      </Tarjeta>

      {(corte.data?.porProducto.length ?? 0) > 0 && (
        <Tarjeta titulo="Cuánto salió de cada producto">
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {corte.data!.porProducto.map((fila) => {
              const cobradoEn = MONEDAS.filter((m) => !D(fila.cobrado[m]).isZero());

              return (
                <li key={fila.nombre} className="flex items-start justify-between gap-3 py-2.5">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{fila.nombre}</span>
                    <span className="tabular text-xs opacity-60">
                      {conUnidad(fila.cantidad, fila.unidad)} en {fila.registros}{' '}
                      {fila.registros === 1 ? 'venta' : 'ventas'}
                    </span>
                  </span>
                  {/* Lo cobrado en cada moneda, una línea por moneda. */}
                  <span className="shrink-0 text-right">
                    {cobradoEn.map((m) => (
                      <span key={m} className="tabular block text-sm font-semibold">
                        {formatMoney(money(fila.cobrado[m], m))}
                      </span>
                    ))}
                    <span className="tabular block text-xs opacity-50">
                      = {formatMoney(money(fila.totalPorMoneda[moneda], moneda))}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-xs opacity-50">
            Arriba, lo que cobraste de verdad en cada moneda. Debajo en gris, todo junto convertido
            a {NOMBRE_MONEDA[moneda]} con la tasa del día de cada venta.
          </p>
        </Tarjeta>
      )}

      <Tarjeta titulo={`Registro por registro · ${etiquetaDia(dia).toLowerCase()}`}>
        {corte.isLoading ? (
          <Cargando />
        ) : (corte.data?.ventas.length ?? 0) === 0 ? (
          <Vacio mensaje={`No hay ventas de mostrador registradas el ${dia}.`} />
        ) : (
          <>
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
                  <span className="tabular shrink-0 text-right text-sm">
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
          </>
        )}
      </Tarjeta>
    </div>
  );
}

/**
 * Todos los registros de un mismo producto, bajo su encabezado.
 *
 * El nombre se escribe una vez arriba y no en cada renglón: así se ve de un
 * golpe cuántas veces salió la papa hoy y por cuánto, sin leer cinco veces la
 * misma palabra.
 */
function GrupoProducto({
  grupo,
  claveNueva,
  refNueva,
  onAgregarOtra,
  onCambiar,
  onQuitar,
  onGuardar,
  onForzar,
}: {
  grupo: Grupo;
  claveNueva: number | null;
  refNueva: React.RefObject<HTMLLIElement | null>;
  onAgregarOtra: () => void;
  onCambiar: (clave: number, cambios: Partial<Linea>) => void;
  onQuitar: (clave: number) => void;
  onGuardar: (linea: Linea) => void;
  onForzar: (linea: Linea) => void;
}) {
  const subtotal = porMoneda(grupo.lineas);
  const vendido = grupo.lineas.reduce((acc, l) => acc.plus(D(l.cantidad || '0')), D(0)).toString();

  return (
    <section className="rounded-lg border border-slate-200 dark:border-slate-800">
      <header className="flex items-baseline justify-between gap-2 border-b border-slate-200 px-3 py-2 dark:border-slate-800">
        <div className="min-w-0">
          <p className="truncate font-bold">{grupo.nombre}</p>
          <p className="tabular text-xs opacity-50">
            quedan {conUnidad(grupo.stock, grupo.unidad)}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="tabular text-sm font-semibold">{comoTexto(subtotal)}</p>
          <p className="tabular text-xs opacity-50">
            {conUnidad(vendido, grupo.unidad)} en {grupo.lineas.length}
          </p>
        </div>
      </header>

      <ul className="divide-y divide-slate-100 px-3 dark:divide-slate-800">
        {grupo.lineas.map((linea, indice) => (
          <RenglonVenta
            key={linea.clave}
            ref={linea.clave === claveNueva ? refNueva : undefined}
            esNueva={linea.clave === claveNueva}
            numeroEnGrupo={indice + 1}
            totalEnGrupo={grupo.lineas.length}
            linea={linea}
            onCambiar={(cambios) => onCambiar(linea.clave, cambios)}
            onQuitar={() => onQuitar(linea.clave)}
            onGuardar={() => onGuardar(linea)}
            onForzar={() => onForzar(linea)}
          />
        ))}
      </ul>

      {/* Repetir el mismo producto es lo más común del día: el botón vive aquí,
          debajo del último renglón, para no tener que volver a la cuadrícula. */}
      <button
        type="button"
        onClick={onAgregarOtra}
        className="min-h-[44px] w-full rounded-b-lg border-t border-dashed border-slate-300 text-sm font-semibold opacity-70 transition hover:opacity-100 dark:border-slate-700"
      >
        + Añadir otra venta de {grupo.nombre.toLowerCase()}
      </button>
    </section>
  );
}

/** Un registro: cuánto salió, a cómo y en qué se cobró. */
function RenglonVenta({
  ref,
  esNueva,
  numeroEnGrupo,
  totalEnGrupo,
  linea,
  onCambiar,
  onQuitar,
  onGuardar,
  onForzar,
}: {
  ref?: React.Ref<HTMLLIElement>;
  esNueva: boolean;
  numeroEnGrupo: number;
  totalEnGrupo: number;
  linea: Linea;
  onCambiar: (cambios: Partial<Linea>) => void;
  onQuitar: () => void;
  onGuardar: () => void;
  onForzar: () => void;
}) {
  const completa = D(linea.cantidad || '0').greaterThan(0) && D(linea.precio || '0').greaterThan(0);
  const subtotal = subtotalDe(linea);
  const pasaDelStock = D(linea.cantidad || '0').greaterThan(D(linea.stock));

  if (linea.estado === 'GUARDADA') {
    return (
      <li ref={ref} className="flex items-center justify-between gap-2 py-2.5">
        <span className="min-w-0 flex-1 text-sm">
          <span className="tabular opacity-60">
            {conUnidad(linea.cantidad, linea.unidad)} ×{' '}
            {formatMoney(money(linea.precio, linea.moneda))}
          </span>
          <span className="block text-xs text-emerald-700 dark:text-emerald-400">
            Guardada · {linea.numero}
          </span>
        </span>
        <span className="tabular shrink-0 text-sm opacity-60">
          {formatMoney(money(subtotal, linea.moneda))}
        </span>
      </li>
    );
  }

  return (
    <li ref={ref} className="scroll-mt-24 space-y-2 py-3">
      {totalEnGrupo > 1 && (
        <p className="text-[11px] font-semibold tracking-wide uppercase opacity-40">
          Registro {numeroEnGrupo}
        </p>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Campo
          etiqueta={`Cuántos ${plural(linea.unidad, 2).toLowerCase()}`}
          valor={linea.cantidad}
          onChange={(v) => onCambiar({ cantidad: v })}
          numerico
          autoFocus={esNueva}
        />
        <CampoDinero
          etiqueta={`Precio por ${linea.unidad.toLowerCase()}`}
          valor={linea.precio}
          onChange={(v) => onCambiar({ precio: v })}
        />
      </div>

      {/* La moneda es de esta venta, no de la tanda: en el mostrador una se
          cobra en bolívares y la siguiente en dólares. */}
      <div>
        <p className="mb-1 text-xs font-medium opacity-70">¿En qué te la pagaron?</p>
        <div className="grid grid-cols-3 gap-2">
          {MONEDAS.map((codigo) => (
            <button
              key={codigo}
              type="button"
              onClick={() => onCambiar({ moneda: codigo })}
              aria-pressed={linea.moneda === codigo}
              className={[
                'min-h-[44px] rounded-lg border text-sm font-semibold',
                linea.moneda === codigo
                  ? 'border-brand-600 bg-brand-600 text-white'
                  : 'border-slate-300 dark:border-slate-700',
              ].join(' ')}
            >
              {codigo}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <span className="tabular min-w-0 flex-1 text-sm">
          {completa ? (
            <>
              <span className="opacity-60">Sale en </span>
              <strong>{formatMoney(money(subtotal, linea.moneda))}</strong>
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
        <button
          type="button"
          aria-label={`Quitar el registro ${numeroEnGrupo} de ${linea.nombre}`}
          onClick={onQuitar}
          className="shrink-0 px-1 text-lg opacity-40"
        >
          ✕
        </button>
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
