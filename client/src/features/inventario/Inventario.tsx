import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  D,
  MONEDAS,
  cantidadTexto,
  conUnidad,
  formatMoney,
  money,
  plural,
  type Moneda,
} from '@geovanny/shared';
import type { ApiError } from '../../lib/api';
import { api } from '../../lib/api';
import { Aviso, Boton, Campo, Cargando, Seleccion, Tarjeta, Vacio } from '../../components/ui/base';
import { CampoCantidad } from '../../components/ui/CampoCantidad';
import { CampoDinero } from '../../components/ui/CampoDinero';
import { useAuth } from '../auth/AuthContext';
import type { Producto } from '../../lib/tipos';

const UNIDADES = ['BULTO', 'CAJA', 'SACO', 'KILO', 'UNIDAD'];

/** Qué está abierto debajo de una tarjeta. Solo una cosa a la vez. */
type Panel = 'editar' | 'cantidad' | 'eliminar';

export function Inventario() {
  const clienteDeQuery = useQueryClient();
  const { puede } = useAuth();
  const [creando, setCreando] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [abierto, setAbierto] = useState<{ id: string; panel: Panel } | null>(null);

  const consulta = useQuery({
    queryKey: ['productos', ''],
    queryFn: () => api<Producto[]>('/productos'),
  });

  const refrescar = () => {
    setAbierto(null);
    void clienteDeQuery.invalidateQueries();
  };

  if (consulta.isLoading) return <Cargando />;

  const todos = consulta.data ?? [];
  const filtro = busqueda.trim().toLowerCase();
  const productos = filtro
    ? todos.filter((p) => p.nombre.toLowerCase().includes(filtro))
    : todos;

  const puedeEditar = puede('product:write');
  const puedeAjustar = puede('inventory:adjust');

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold">Inventario</h1>
        <div className="flex shrink-0 gap-3 text-sm">
          <Link to="/ventas-totales" className="underline opacity-70">
            Ventas totales
          </Link>
          <Link to="/mas/comprar" className="underline opacity-70">
            Registrar viaje
          </Link>
        </div>
      </div>

      {todos.length === 0 && !creando && (
        <Vacio
          mensaje="Todavía no hay productos. Crea los que manejas tú: el catálogo empieza vacío."
          accion={
            puedeEditar ? <Boton onClick={() => setCreando(true)}>Crear el primero</Boton> : undefined
          }
        />
      )}

      {todos.length > 4 && (
        <Campo valor={busqueda} onChange={setBusqueda} placeholder="Buscar producto…" />
      )}

      <ul className="space-y-2">
        {productos.map((producto) => (
          <TarjetaProducto
            key={producto.id}
            producto={producto}
            panel={abierto?.id === producto.id ? abierto.panel : null}
            onAbrir={(panel) =>
              setAbierto((previo) =>
                previo?.id === producto.id && previo.panel === panel
                  ? null
                  : { id: producto.id, panel },
              )
            }
            onCerrar={() => setAbierto(null)}
            onListo={refrescar}
            puedeEditar={puedeEditar}
            puedeAjustar={puedeAjustar}
          />
        ))}
      </ul>

      {filtro && productos.length === 0 && (
        <Vacio mensaje={`Ningún producto se llama así ("${busqueda}").`} />
      )}

      {creando ? (
        <FormularioProducto
          onListo={() => {
            setCreando(false);
            void clienteDeQuery.invalidateQueries();
          }}
          onCancelar={() => setCreando(false)}
        />
      ) : (
        puedeEditar &&
        todos.length > 0 && (
          <Boton variante="secundario" onClick={() => setCreando(true)} className="w-full">
            Agregar producto
          </Boton>
        )
      )}
    </div>
  );
}

function TarjetaProducto({
  producto,
  panel,
  onAbrir,
  onCerrar,
  onListo,
  puedeEditar,
  puedeAjustar,
}: {
  producto: Producto;
  panel: Panel | null;
  onAbrir: (panel: Panel) => void;
  onCerrar: () => void;
  onListo: () => void;
  puedeEditar: boolean;
  puedeAjustar: boolean;
}) {
  const bajo =
    D(producto.stockMinimo).greaterThan(0) &&
    D(producto.stock).lessThanOrEqualTo(D(producto.stockMinimo));
  const sinNada = D(producto.stock).isZero();
  const valor = D(producto.stock).times(D(producto.costoPromedio));

  return (
    <li className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold">{producto.nombre}</p>
          <p className="text-xs opacity-60">
            {D(producto.costoPromedio).isZero()
              ? 'Sin costo registrado todavía'
              : `Costo ${formatMoney(money(producto.costoPromedio, 'COP'))} por ${producto.unidad.toLowerCase()}`}
          </p>
          {D(producto.precioVenta).greaterThan(0) && (
            <p className="text-xs opacity-60">
              Se vende a {formatMoney(money(producto.precioVenta, producto.monedaVenta))}
            </p>
          )}
        </div>
        <div className="shrink-0 text-right">
          <p
            className={`tabular text-xl font-bold ${bajo ? 'text-amber-600' : sinNada ? 'opacity-40' : ''}`}
          >
            {cantidadTexto(producto.stock)}
          </p>
          <p className="text-xs opacity-60">{plural(producto.unidad, producto.stock)}</p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <span className="tabular text-xs opacity-60">
          Vale {formatMoney(money(valor.toString(), 'COP'))}
        </span>
        <div className="flex gap-3 text-sm">
          {puedeAjustar && (
            <button
              type="button"
              onClick={() => onAbrir('cantidad')}
              className={panel === 'cantidad' ? 'font-semibold underline' : 'underline opacity-70'}
            >
              Cantidad
            </button>
          )}
          {puedeEditar && (
            <>
              <button
                type="button"
                onClick={() => onAbrir('editar')}
                className={panel === 'editar' ? 'font-semibold underline' : 'underline opacity-70'}
              >
                Editar
              </button>
              <button
                type="button"
                onClick={() => onAbrir('eliminar')}
                className="text-rose-600 underline dark:text-rose-400"
              >
                Eliminar
              </button>
            </>
          )}
        </div>
      </div>

      {panel === 'cantidad' && (
        <FormularioCantidad producto={producto} onListo={onListo} onCancelar={onCerrar} />
      )}
      {panel === 'editar' && (
        <div className="mt-3 border-t border-slate-200 pt-3 dark:border-slate-800">
          <FormularioProducto producto={producto} onListo={onListo} onCancelar={onCerrar} />
        </div>
      )}
      {panel === 'eliminar' && (
        <ConfirmarEliminar producto={producto} onListo={onListo} onCancelar={onCerrar} />
      )}
    </li>
  );
}

/**
 * Alta y edición con el mismo formulario: son los mismos datos, y tener dos
 * pantallas distintas para lo mismo solo garantiza que se desincronicen.
 *
 * Al crear se puede decir cuánto hay ya en el almacén; al editar no, porque el
 * stock nunca se escribe a mano: se cambia con un movimiento (RC-10) desde
 * "Cantidad", que deja escrito qué pasó.
 */
function FormularioProducto({
  producto,
  onListo,
  onCancelar,
}: {
  producto?: Producto;
  onListo: () => void;
  onCancelar: () => void;
}) {
  const editando = Boolean(producto);

  const [nombre, setNombre] = useState(producto?.nombre ?? '');
  const [unidad, setUnidad] = useState(producto?.unidad ?? 'BULTO');
  const [precioVenta, setPrecioVenta] = useState(
    producto && producto.precioVenta !== '0' ? producto.precioVenta : '',
  );
  const [monedaVenta, setMonedaVenta] = useState<Moneda>(producto?.monedaVenta ?? 'VES');
  const [stockMinimo, setStockMinimo] = useState(
    producto && producto.stockMinimo !== '0' ? producto.stockMinimo : '',
  );
  const [cantidadInicial, setCantidadInicial] = useState('');
  const [costoUnitario, setCostoUnitario] = useState('');
  const [monedaCosto, setMonedaCosto] = useState<Moneda>('COP');
  const [error, setError] = useState<string | null>(null);

  const guardar = useMutation({
    mutationFn: () =>
      api(editando ? `/productos/${producto!.id}` : '/productos', {
        method: editando ? 'PATCH' : 'POST',
        body: JSON.stringify({
          nombre: nombre.trim().toUpperCase(),
          unidad,
          precioVenta: precioVenta || '0',
          monedaVenta,
          stockMinimo: stockMinimo || '0',
          ...(editando
            ? {}
            : {
                cantidadInicial: cantidadInicial || '0',
                costoUnitario: costoUnitario || '0',
                monedaCosto,
              }),
        }),
      }),
    onSuccess: onListo,
    onError: (e: ApiError) => setError(e.message),
  });

  const campos = (
    <div className="space-y-3">
      <Campo etiqueta="Nombre" valor={nombre} onChange={setNombre} autoFocus={!editando} />

      <div className="grid grid-cols-2 gap-3">
        <Seleccion
          etiqueta="Se vende por"
          valor={unidad}
          onChange={setUnidad}
          opciones={UNIDADES.map((u) => ({ valor: u, texto: u.toLowerCase() }))}
        />
        <Seleccion
          etiqueta="Moneda habitual"
          valor={monedaVenta}
          onChange={setMonedaVenta}
          opciones={MONEDAS.map((m) => ({ valor: m, texto: m }))}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <CampoDinero
          etiqueta="Precio de venta (opcional)"
          valor={precioVenta}
          onChange={setPrecioVenta}
          moneda={monedaVenta}
        />
        <Campo
          etiqueta="Avisar cuando queden"
          valor={stockMinimo}
          onChange={setStockMinimo}
          numerico
          placeholder="0"
        />
      </div>

      {!editando && (
        <div className="space-y-3 rounded-lg bg-slate-50 p-3 dark:bg-slate-800/50">
          <p className="text-xs font-semibold opacity-70">¿Ya tienes de este producto?</p>
          <div className="grid grid-cols-2 gap-3">
            <CampoCantidad
              etiqueta={`Cuántos ${plural(unidad, 2).toLowerCase()} hay`}
              valor={cantidadInicial}
              onChange={setCantidadInicial}
              unidad={unidad}
            />
            <CampoDinero
              etiqueta="Costo por unidad"
              valor={costoUnitario}
              onChange={setCostoUnitario}
              moneda={monedaCosto}
              placeholder="0"
            />
          </div>
          <Seleccion
            etiqueta="¿En qué moneda te costó?"
            valor={monedaCosto}
            onChange={setMonedaCosto}
            opciones={MONEDAS.map((m) => ({ valor: m, texto: m }))}
          />
          <p className="text-xs opacity-60">
            Se anota como existencia inicial, con fecha y motivo, igual que cualquier otro
            movimiento. Si dejas el costo en blanco, el sistema creerá que la mercancía salió
            gratis y la ganancia de las ventas saldrá inflada.
          </p>
        </div>
      )}

      {editando && (
        <p className="text-xs opacity-60">
          Las existencias no se cambian aquí. Usa <strong>Cantidad</strong> para que quede escrito
          qué pasó con ellas.
        </p>
      )}

      {error && <Aviso tono="error">{error}</Aviso>}

      <div className="flex gap-2">
        <Boton variante="secundario" onClick={onCancelar} className="flex-1">
          Cancelar
        </Boton>
        <Boton
          onClick={() => guardar.mutate()}
          disabled={!nombre.trim() || guardar.isPending}
          className="flex-1"
        >
          {guardar.isPending ? 'Guardando…' : 'Guardar'}
        </Boton>
      </div>
    </div>
  );

  return editando ? campos : <Tarjeta titulo="Nuevo producto">{campos}</Tarjeta>;
}

/** Las cuatro razones reales por las que cambia una existencia. */
const MOTIVOS = [
  { valor: 'CONTEO', texto: 'Conté y hay…', ayuda: 'Escribe cuánto hay de verdad' },
  { valor: 'ENTRO', texto: 'Entró mercancía', ayuda: 'Suma lo que llegó' },
  { valor: 'MERMA', texto: 'Merma o daño', ayuda: 'Resta lo que se perdió' },
  { valor: 'DEVOLUCION', texto: 'Devolución', ayuda: 'Suma lo que devolvieron' },
] as const;

type Motivo = (typeof MOTIVOS)[number]['valor'];

function FormularioCantidad({
  producto,
  onListo,
  onCancelar,
}: {
  producto: Producto;
  onListo: () => void;
  onCancelar: () => void;
}) {
  const [que, setQue] = useState<Motivo>('CONTEO');
  const [cantidad, setCantidad] = useState('');
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState<string | null>(null);

  const elegido = MOTIVOS.find((m) => m.valor === que)!;

  const ajustar = useMutation({
    mutationFn: () =>
      api(`/productos/${producto.id}/ajuste`, {
        method: 'POST',
        body: JSON.stringify({
          // El signo lo pone el sistema: pedirlo a mano es el error fácil.
          ...(que === 'CONTEO'
            ? { nuevaCantidad: cantidad }
            : { cantidad: que === 'MERMA' ? `-${cantidad}` : cantidad }),
          tipo: que === 'MERMA' ? 'MERMA' : que === 'DEVOLUCION' ? 'DEVOLUCION' : 'AJUSTE',
          motivo: motivo.trim() || elegido.texto,
        }),
      }),
    onSuccess: onListo,
    onError: (e: ApiError) => setError(e.message),
  });

  // Cómo queda la existencia si se guarda: se ve antes de tocar nada.
  const resultado = (() => {
    if (!cantidad) return null;
    const actual = D(producto.stock);
    const valor = D(cantidad);
    if (que === 'CONTEO') return valor;
    return que === 'MERMA' ? actual.minus(valor) : actual.plus(valor);
  })();

  return (
    <div className="mt-3 space-y-3 border-t border-slate-200 pt-3 dark:border-slate-800">
      <div className="grid grid-cols-2 gap-2">
        {MOTIVOS.map((opcion) => (
          <button
            key={opcion.valor}
            type="button"
            onClick={() => setQue(opcion.valor)}
            className={[
              'min-h-[44px] rounded-lg border px-2 text-sm font-medium',
              que === opcion.valor
                ? 'border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-900'
                : 'border-slate-300 dark:border-slate-700',
            ].join(' ')}
          >
            {opcion.texto}
          </button>
        ))}
      </div>

      <CampoCantidad
        etiqueta={`${elegido.ayuda} (${plural(producto.unidad, 2).toLowerCase()})`}
        valor={cantidad}
        onChange={setCantidad}
        unidad={producto.unidad}
        autoFocus
      />

      {resultado && (
        <p className="tabular text-sm opacity-70">
          Antes {conUnidad(producto.stock, producto.unidad)} → después{' '}
          <strong>{conUnidad(resultado.toString(), producto.unidad)}</strong>
          {resultado.isNegative() && (
            <span className="block text-amber-600 dark:text-amber-400">
              Quedaría en negativo. Revisa el número antes de guardar.
            </span>
          )}
        </p>
      )}

      <Campo
        etiqueta="Motivo"
        valor={motivo}
        onChange={setMotivo}
        placeholder={elegido.texto}
      />

      {error && <Aviso tono="error">{error}</Aviso>}

      <div className="flex gap-2">
        <Boton variante="secundario" onClick={onCancelar} className="flex-1">
          Cancelar
        </Boton>
        <Boton
          onClick={() => ajustar.mutate()}
          disabled={!cantidad || ajustar.isPending}
          className="flex-1"
        >
          {ajustar.isPending ? 'Guardando…' : 'Guardar'}
        </Boton>
      </div>
    </div>
  );
}

/**
 * Eliminar avisa de lo que va a pasar de verdad.
 *
 * Un producto sin movimientos desaparece; uno que ya se vendió o se compró solo
 * se oculta, porque borrarlo dejaría sin nombre las ventas donde aparece.
 */
function ConfirmarEliminar({
  producto,
  onListo,
  onCancelar,
}: {
  producto: Producto;
  onListo: () => void;
  onCancelar: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const conStock = !D(producto.stock).isZero();

  const eliminar = useMutation({
    mutationFn: () => api(`/productos/${producto.id}`, { method: 'DELETE' }),
    onSuccess: onListo,
    onError: (e: ApiError) => setError(e.message),
  });

  return (
    <div className="mt-3 space-y-3 border-t border-slate-200 pt-3 dark:border-slate-800">
      <Aviso tono="atencion">
        <p>
          ¿Quitar <strong>{producto.nombre}</strong> del inventario?
        </p>
        {conStock && (
          <p className="mt-1">
            Todavía figuran {conUnidad(producto.stock, producto.unidad)}. Dejará de contarse en el
            valor del inventario.
          </p>
        )}
        <p className="mt-1 text-xs opacity-80">
          Si ya se vendió o se compró alguna vez, se oculta pero su historial se conserva: las
          ventas viejas seguirán mostrando el producto.
        </p>
      </Aviso>

      {error && <Aviso tono="error">{error}</Aviso>}

      <div className="flex gap-2">
        <Boton variante="secundario" onClick={onCancelar} className="flex-1">
          No, dejarlo
        </Boton>
        <Boton
          variante="peligro"
          onClick={() => eliminar.mutate()}
          disabled={eliminar.isPending}
          className="flex-1"
        >
          {eliminar.isPending ? 'Quitando…' : 'Sí, quitar'}
        </Boton>
      </div>
    </div>
  );
}
