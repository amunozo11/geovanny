import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  D,
  MONEDAS,
  cantidadTexto,
  conUnidad,
  formatMoney,
  money,
  type Moneda,
} from '@geovanny/shared';
import type { ApiError} from '../../lib/api';
import { api } from '../../lib/api';
import { Aviso, Boton, Campo, Tarjeta } from '../../components/ui/base';
import { CampoCantidad } from '../../components/ui/CampoCantidad';
import { CampoDinero } from '../../components/ui/CampoDinero';
import { BuscadorPersona } from '../clientes/BuscadorPersona';
import { CampoFecha, comoInstante, hoy } from '../../components/ui/CampoFecha';
import type { Persona, Producto } from '../../lib/tipos';

interface Linea {
  productoId: string;
  nombre: string;
  unidad: string;
  cantidad: string;
  precio: string;
}

/**
 * Nueva venta en una sola pantalla.
 *
 * Sin pasos, sin ventanas encima de ventanas: cliente, productos y guardar. El
 * total se ve siempre, y tras agregar un producto el foco vuelve al buscador
 * para poder encadenar el siguiente sin tocar nada más.
 *
 * **Aquí todo se vende fiado.** Es lo que pasa siempre con un cliente con
 * nombre: se despacha y queda debiendo. Lo de contado no pasa por esta pantalla,
 * va por Ventas totales, en el mostrador. Por eso no hay ningún selector de
 * forma de pago que tocar —ni que olvidarse de tocar—: los abonos se registran
 * después desde la cuenta del cliente, que es cuando de verdad entra la plata.
 */
export function Vender() {
  const navegar = useNavigate();
  const clienteDeQuery = useQueryClient();

  const [cliente, setCliente] = useState<Persona | null>(null);
  const [moneda, setMoneda] = useState<Moneda>('VES');
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [elegido, setElegido] = useState<Producto | null>(null);
  const [cantidad, setCantidad] = useState('');
  const [precio, setPrecio] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [forzar, setForzar] = useState(false);
  const [dia, setDia] = useState(hoy());

  const productos = useQuery({
    queryKey: ['productos', busqueda],
    queryFn: () => api<Producto[]>(`/productos?q=${encodeURIComponent(busqueda)}`),
  });

  const total = useMemo(
    () => lineas.reduce((acc, l) => acc.plus(D(l.cantidad).times(D(l.precio))), D(0)),
    [lineas],
  );

  const guardar = useMutation({
    mutationFn: () =>
      api('/operaciones' + (forzar ? '?forzar=true' : ''), {
        method: 'POST',
        body: JSON.stringify({
          tipo: 'VENTA',
          personaId: cliente!.id,
          moneda,
          items: lineas.map((l) => ({
            productoId: l.productoId,
            cantidad: l.cantidad,
            precio: l.precio,
          })),
          formaPago: 'FIADO',
          // Fiado no mueve caja: la plata entra cuando el cliente abone, desde
          // su cuenta, y ahí es donde se elige dónde cae.
          cajaId: null,
          fecha: dia === hoy() ? undefined : comoInstante(dia),
        }),
      }),
    onSuccess: () => {
      void clienteDeQuery.invalidateQueries();
      navegar('/');
    },
    onError: (e: ApiError) => {
      setError(e.message);
      // Si el problema es que no hay existencias, se ofrece continuar: así
      // trabaja hoy con el cuaderno, y bloquearlo pararía una venta real.
      if (e.code === 'SIN_STOCK') setForzar(true);
    },
  });

  function elegirProducto(producto: Producto) {
    setElegido(producto);
    setCantidad('');
    // Se propone el último precio del producto; siempre se puede cambiar.
    setPrecio(producto.precioVenta !== '0' ? producto.precioVenta : '');
    if (producto.monedaVenta) setMoneda(producto.monedaVenta);
  }

  function agregar() {
    if (!elegido || !cantidad || !precio) return;
    setLineas((previas) => [
      ...previas,
      {
        productoId: elegido.id,
        nombre: elegido.nombre,
        unidad: elegido.unidad,
        cantidad,
        precio,
      },
    ]);
    setElegido(null);
    setCantidad('');
    setPrecio('');
    setBusqueda('');
    setError(null);
  }

  const puedeGuardar = cliente && lineas.length > 0 && !guardar.isPending;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Nueva venta</h1>

      <Tarjeta titulo="Cliente">
        <BuscadorPersona tipo="CLIENTE" elegida={cliente} onElegir={setCliente} />
        <div className="mt-3">
          <CampoFecha valor={dia} onChange={setDia} etiqueta="¿Qué día fue la venta?" />
        </div>
      </Tarjeta>

      <Tarjeta titulo="Productos">
        {!elegido ? (
          <>
            <Campo valor={busqueda} onChange={setBusqueda} placeholder="Buscar producto…" />
            <ul className="mt-2 divide-y divide-slate-100 dark:divide-slate-800">
              {(productos.data ?? []).slice(0, 6).map((producto) => (
                <li key={producto.id}>
                  <button
                    type="button"
                    onClick={() => elegirProducto(producto)}
                    className="flex w-full items-center justify-between py-3 text-left"
                  >
                    <span className="font-medium">{producto.nombre}</span>
                    <span className="text-xs opacity-60">
                      {conUnidad(producto.stock, producto.unidad)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="font-semibold">{elegido.nombre}</p>
              <button
                type="button"
                onClick={() => setElegido(null)}
                className="text-sm underline opacity-60"
              >
                cambiar
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <CampoCantidad
                etiqueta={`Cantidad (${elegido.unidad.toLowerCase()})`}
                valor={cantidad}
                onChange={setCantidad}
                unidad={elegido.unidad}
                autoFocus
              />
              <CampoDinero etiqueta="Precio por unidad" valor={precio} onChange={setPrecio} />
            </div>
            {cantidad && precio && (
              <p className="tabular text-sm opacity-70">
                Subtotal: {formatMoney(money(D(cantidad).times(D(precio)).toString(), moneda))}
              </p>
            )}
            <Boton onClick={agregar} disabled={!cantidad || !precio} className="w-full">
              Agregar
            </Boton>
          </div>
        )}
      </Tarjeta>

      {lineas.length > 0 && (
        <Tarjeta titulo="En esta venta">
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {lineas.map((linea, indice) => (
              <li key={`${linea.productoId}-${indice}`} className="flex items-center gap-2 py-2">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{linea.nombre}</span>
                  <span className="tabular text-xs opacity-60">
                    {cantidadTexto(linea.cantidad)} × {formatMoney(money(linea.precio, moneda))}
                  </span>
                </span>
                <span className="tabular text-sm">
                  {formatMoney(money(D(linea.cantidad).times(D(linea.precio)).toString(), moneda))}
                </span>
                <button
                  type="button"
                  aria-label={`Quitar ${linea.nombre}`}
                  onClick={() => setLineas((previas) => previas.filter((_, i) => i !== indice))}
                  className="px-2 text-lg opacity-40"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </Tarjeta>
      )}

      <Tarjeta titulo="Moneda de la venta">
        <div className="grid grid-cols-3 gap-2">
          {MONEDAS.map((codigo) => (
            <button
              key={codigo}
              type="button"
              onClick={() => setMoneda(codigo)}
              className={[
                'min-h-[48px] rounded-lg border font-semibold',
                moneda === codigo
                  ? 'border-brand-600 bg-brand-600 text-white'
                  : 'border-slate-300 dark:border-slate-700',
              ].join(' ')}
            >
              {codigo}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs opacity-60">
          En qué moneda se pacta la venta. No es lo mismo que la moneda en la que ves las cifras.
        </p>
      </Tarjeta>

      {error && (
        <Aviso tono="error">
          {error}
          {forzar && (
            <p className="mt-2">
              Puedes registrarla igual y el inventario quedará en negativo hasta que entre
              mercancía.
            </p>
          )}
        </Aviso>
      )}

      {/* El total y el botón van juntos, pegados abajo: es lo último que se mira. */}
      <div className="safe-bottom sticky bottom-20 rounded-xl border border-slate-200 bg-white p-4 shadow-lg dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-3 flex items-baseline justify-between">
          <span className="text-sm opacity-60">Queda debiendo</span>
          <span className="tabular text-2xl font-bold">
            {formatMoney(money(total.toString(), moneda))}
          </span>
        </div>
        <Boton
          onClick={() => guardar.mutate()}
          disabled={!puedeGuardar}
          className="w-full"
          variante={forzar ? 'peligro' : 'primario'}
        >
          {guardar.isPending
            ? 'Guardando…'
            : forzar
              ? 'Registrar igual (sin existencias)'
              : 'Guardar venta fiada'}
        </Boton>
        {!cliente && <p className="mt-2 text-center text-xs opacity-50">Falta elegir el cliente</p>}
        {cliente && lineas.length === 0 && (
          <p className="mt-2 text-center text-xs opacity-50">Falta agregar productos</p>
        )}
        {puedeGuardar && (
          <p className="mt-2 text-center text-xs opacity-50">
            Se carga a la cuenta de {cliente.nombre}. Los abonos se registran desde ahí.
          </p>
        )}
      </div>
    </div>
  );
}
