import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { D, MONEDAS, conUnidad, formatMoney, money, type Moneda } from '@geovanny/shared';
import type { ApiError} from '../../lib/api';
import { api } from '../../lib/api';
import { Aviso, Boton, Campo, Tarjeta } from '../../components/ui/base';
import { CampoDinero } from '../../components/ui/CampoDinero';
import { BuscadorPersona } from '../clientes/BuscadorPersona';
import { CampoFecha, comoInstante, hoy } from '../../components/ui/CampoFecha';
import type { Persona, Producto } from '../../lib/tipos';

interface Linea {
  productoId: string;
  nombre: string;
  cantidad: string;
  precio: string;
}

/**
 * Registrar un viaje: la mercancía que entra.
 *
 * El **cargue** se anota aparte y el sistema lo reparte entre los productos
 * según su valor, para saber cuánto costó de verdad cada bulto. Es la
 * diferencia entre creer que la papa costó 104.000 y saber que costó 114.000.
 */
export function Comprar() {
  const navegar = useNavigate();
  const clienteDeQuery = useQueryClient();

  const [proveedor, setProveedor] = useState<Persona | null>(null);
  const [moneda, setMoneda] = useState<Moneda>('COP');
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [elegido, setElegido] = useState<Producto | null>(null);
  const [cantidad, setCantidad] = useState('');
  const [precio, setPrecio] = useState('');
  const [cargue, setCargue] = useState('');
  const [formaPago, setFormaPago] = useState<'CONTADO' | 'FIADO'>('FIADO');
  const [dia, setDia] = useState(hoy());
  const [error, setError] = useState<string | null>(null);

  const productos = useQuery({
    queryKey: ['productos', ''],
    queryFn: () => api<Producto[]>('/productos'),
  });

  const subtotal = useMemo(
    () => lineas.reduce((acc, l) => acc.plus(D(l.cantidad).times(D(l.precio))), D(0)),
    [lineas],
  );
  const total = subtotal.plus(D(cargue || '0'));

  const guardar = useMutation({
    mutationFn: () =>
      api('/operaciones', {
        method: 'POST',
        body: JSON.stringify({
          tipo: 'COMPRA',
          personaId: proveedor!.id,
          moneda,
          items: lineas.map((l) => ({
            productoId: l.productoId,
            cantidad: l.cantidad,
            precio: l.precio,
          })),
          cargue: cargue ? [{ concepto: 'Cargue y transporte', monto: cargue }] : [],
          formaPago,
          fecha: dia === hoy() ? undefined : comoInstante(dia),
        }),
      }),
    onSuccess: () => {
      void clienteDeQuery.invalidateQueries();
      navegar('/inventario');
    },
    onError: (e: ApiError) => setError(e.message),
  });

  function agregar() {
    if (!elegido || !cantidad || !precio) return;
    setLineas((previas) => [
      ...previas,
      { productoId: elegido.id, nombre: elegido.nombre, cantidad, precio },
    ]);
    setElegido(null);
    setCantidad('');
    setPrecio('');
  }

  return (
    <div className="space-y-4">
      <div>
        <Link to="/mas" className="text-sm opacity-60">
          ← Más
        </Link>
        <h1 className="text-xl font-bold">Registrar viaje</h1>
      </div>

      <Tarjeta titulo="Proveedor">
        <BuscadorPersona tipo="PROVEEDOR" elegida={proveedor} onElegir={setProveedor} />
        <div className="mt-3">
          <CampoFecha valor={dia} onChange={setDia} etiqueta="¿Qué día llegó el viaje?" />
        </div>
      </Tarjeta>

      <Tarjeta titulo="Mercancía que entra">
        {!elegido ? (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {(productos.data ?? []).map((producto) => (
              <li key={producto.id}>
                <button
                  type="button"
                  onClick={() => setElegido(producto)}
                  className="flex w-full items-center justify-between py-3 text-left"
                >
                  <span className="font-medium">{producto.nombre}</span>
                  <span className="text-xs opacity-60">
                    tiene {conUnidad(producto.stock, producto.unidad)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="space-y-3">
            <p className="font-semibold">{elegido.nombre}</p>
            <div className="grid grid-cols-2 gap-3">
              <Campo
                etiqueta={`Cuántos ${elegido.unidad.toLowerCase()}`}
                valor={cantidad}
                onChange={setCantidad}
                numerico
                autoFocus
              />
              <CampoDinero etiqueta="Precio de compra" valor={precio} onChange={setPrecio} />
            </div>
            <div className="flex gap-2">
              <Boton variante="secundario" onClick={() => setElegido(null)} className="flex-1">
                Cancelar
              </Boton>
              <Boton onClick={agregar} disabled={!cantidad || !precio} className="flex-1">
                Agregar
              </Boton>
            </div>
          </div>
        )}
      </Tarjeta>

      {lineas.length > 0 && (
        <Tarjeta titulo="En este viaje">
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {lineas.map((linea, indice) => (
              <li key={indice} className="flex items-center justify-between gap-2 py-2 text-sm">
                <span className="truncate">
                  {linea.cantidad} × {linea.nombre}
                </span>
                <span className="tabular">
                  {formatMoney(money(D(linea.cantidad).times(D(linea.precio)).toString(), moneda))}
                </span>
                <button
                  type="button"
                  onClick={() => setLineas((p) => p.filter((_, i) => i !== indice))}
                  className="px-1 opacity-40"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </Tarjeta>
      )}

      <Tarjeta titulo="Cargue y transporte">
        <CampoDinero valor={cargue} onChange={setCargue} placeholder="0" />
        <p className="mt-2 text-xs opacity-60">
          Se reparte entre los productos según lo que valga cada uno, para saber el costo real por
          bulto.
        </p>
      </Tarjeta>

      <div className="grid grid-cols-2 gap-2">
        {(
          [
            ['FIADO', 'Queda debiendo'],
            ['CONTADO', 'Pagado'],
          ] as const
        ).map(([valor, texto]) => (
          <button
            key={valor}
            type="button"
            onClick={() => setFormaPago(valor)}
            className={[
              'min-h-[52px] rounded-lg border font-semibold',
              formaPago === valor
                ? 'border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-900'
                : 'border-slate-300 dark:border-slate-700',
            ].join(' ')}
          >
            {texto}
          </button>
        ))}
      </div>

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

      {error && <Aviso tono="error">{error}</Aviso>}

      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-1 flex justify-between text-sm opacity-70">
          <span>Mercancía</span>
          <span className="tabular">{formatMoney(money(subtotal.toString(), moneda))}</span>
        </div>
        <div className="mb-3 flex justify-between text-sm opacity-70">
          <span>Cargue</span>
          <span className="tabular">{formatMoney(money(cargue || '0', moneda))}</span>
        </div>
        <div className="mb-3 flex items-baseline justify-between border-t border-slate-200 pt-2 dark:border-slate-800">
          <span className="font-semibold">Total</span>
          <span className="tabular text-2xl font-bold">
            {formatMoney(money(total.toString(), moneda))}
          </span>
        </div>
        <Boton
          onClick={() => guardar.mutate()}
          disabled={!proveedor || lineas.length === 0 || guardar.isPending}
          className="w-full"
        >
          {guardar.isPending ? 'Guardando…' : 'Guardar viaje'}
        </Boton>
      </div>
    </div>
  );
}
