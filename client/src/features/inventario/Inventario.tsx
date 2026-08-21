import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { D, MONEDAS, formatMoney, money, plural, type Moneda } from '@geovanny/shared';
import type { ApiError} from '../../lib/api';
import { api } from '../../lib/api';
import { Aviso, Boton, Campo, Cargando, Seleccion, Tarjeta, Vacio } from '../../components/ui/base';
import type { Producto } from '../../lib/tipos';

const UNIDADES = ['BULTO', 'CAJA', 'SACO', 'KILO', 'UNIDAD'];

export function Inventario() {
  const clienteDeQuery = useQueryClient();
  const [creando, setCreando] = useState(false);
  const [ajustando, setAjustando] = useState<Producto | null>(null);

  const consulta = useQuery({
    queryKey: ['productos', ''],
    queryFn: () => api<Producto[]>('/productos'),
  });

  if (consulta.isLoading) return <Cargando />;
  const productos = consulta.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Inventario</h1>
        <Link to="/mas/comprar" className="text-sm underline opacity-70">
          Registrar viaje
        </Link>
      </div>

      {productos.length === 0 && !creando && (
        <Vacio
          mensaje="No hay productos todavía."
          accion={<Boton onClick={() => setCreando(true)}>Crear el primero</Boton>}
        />
      )}

      <ul className="space-y-2">
        {productos.map((producto) => {
          const bajo =
            D(producto.stockMinimo).greaterThan(0) &&
            D(producto.stock).lessThanOrEqualTo(D(producto.stockMinimo));
          const valor = D(producto.stock).times(D(producto.costoPromedio));

          return (
            <li
              key={producto.id}
              className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold">{producto.nombre}</p>
                  <p className="text-xs opacity-60">
                    Costo {formatMoney(money(producto.costoPromedio, 'COP'))} por{' '}
                    {producto.unidad.toLowerCase()}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className={`tabular text-xl font-bold ${bajo ? 'text-amber-600' : ''}`}>
                    {producto.stock}
                  </p>
                  <p className="text-xs opacity-60">{plural(producto.unidad, producto.stock)}</p>
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between">
                <span className="tabular text-xs opacity-60">
                  Vale {formatMoney(money(valor.toString(), 'COP'))}
                </span>
                <button
                  type="button"
                  onClick={() => setAjustando(producto)}
                  className="text-sm underline opacity-70"
                >
                  Ajustar / merma
                </button>
              </div>

              {ajustando?.id === producto.id && (
                <FormularioAjuste
                  producto={producto}
                  onListo={() => {
                    setAjustando(null);
                    void clienteDeQuery.invalidateQueries();
                  }}
                  onCancelar={() => setAjustando(null)}
                />
              )}
            </li>
          );
        })}
      </ul>

      {creando ? (
        <FormularioProducto
          onListo={() => {
            setCreando(false);
            void clienteDeQuery.invalidateQueries({ queryKey: ['productos'] });
          }}
          onCancelar={() => setCreando(false)}
        />
      ) : (
        productos.length > 0 && (
          <Boton variante="secundario" onClick={() => setCreando(true)} className="w-full">
            Agregar producto
          </Boton>
        )
      )}
    </div>
  );
}

function FormularioProducto({
  onListo,
  onCancelar,
}: {
  onListo: () => void;
  onCancelar: () => void;
}) {
  const [nombre, setNombre] = useState('');
  const [unidad, setUnidad] = useState('BULTO');
  const [precioVenta, setPrecioVenta] = useState('');
  const [monedaVenta, setMonedaVenta] = useState<Moneda>('VES');
  const [error, setError] = useState<string | null>(null);

  const crear = useMutation({
    mutationFn: () =>
      api('/productos', {
        method: 'POST',
        body: JSON.stringify({
          nombre: nombre.toUpperCase(),
          unidad,
          precioVenta: precioVenta || '0',
          monedaVenta,
        }),
      }),
    onSuccess: onListo,
    onError: (e: ApiError) => setError(e.message),
  });

  return (
    <Tarjeta titulo="Nuevo producto">
      <div className="space-y-3">
        <Campo etiqueta="Nombre" valor={nombre} onChange={setNombre} autoFocus />
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
        <Campo
          etiqueta="Precio de venta habitual (opcional)"
          valor={precioVenta}
          onChange={setPrecioVenta}
          numerico
        />
        <p className="text-xs opacity-60">
          Las existencias no se escriben aquí: entran al registrar el viaje de compra, para que
          siempre se sepa de dónde salió cada bulto.
        </p>
        {error && <Aviso tono="error">{error}</Aviso>}
        <div className="flex gap-2">
          <Boton variante="secundario" onClick={onCancelar} className="flex-1">
            Cancelar
          </Boton>
          <Boton onClick={() => crear.mutate()} disabled={!nombre} className="flex-1">
            Guardar
          </Boton>
        </div>
      </div>
    </Tarjeta>
  );
}

function FormularioAjuste({
  producto,
  onListo,
  onCancelar,
}: {
  producto: Producto;
  onListo: () => void;
  onCancelar: () => void;
}) {
  const [cantidad, setCantidad] = useState('');
  const [tipo, setTipo] = useState<'MERMA' | 'AJUSTE' | 'DEVOLUCION'>('MERMA');
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState<string | null>(null);

  const ajustar = useMutation({
    mutationFn: () =>
      api(`/productos/${producto.id}/ajuste`, {
        method: 'POST',
        body: JSON.stringify({
          // La merma resta siempre: se escribe la cantidad en positivo y el
          // sistema pone el signo, que es un error fácil de cometer.
          cantidad: tipo === 'MERMA' ? `-${cantidad}` : cantidad,
          tipo,
          motivo,
        }),
      }),
    onSuccess: onListo,
    onError: (e: ApiError) => setError(e.message),
  });

  return (
    <div className="mt-3 space-y-3 border-t border-slate-200 pt-3 dark:border-slate-800">
      <Seleccion
        etiqueta="Qué pasó"
        valor={tipo}
        onChange={setTipo}
        opciones={[
          { valor: 'MERMA', texto: 'Merma o daño (resta)' },
          { valor: 'DEVOLUCION', texto: 'Devolución (suma)' },
          { valor: 'AJUSTE', texto: 'Corrección de conteo' },
        ]}
      />
      <Campo
        etiqueta={tipo === 'AJUSTE' ? 'Cantidad (usa − para restar)' : 'Cantidad'}
        valor={cantidad}
        onChange={setCantidad}
        numerico
      />
      <Campo etiqueta="Motivo" valor={motivo} onChange={setMotivo} placeholder="Obligatorio" />
      {error && <Aviso tono="error">{error}</Aviso>}
      <div className="flex gap-2">
        <Boton variante="secundario" onClick={onCancelar} className="flex-1">
          Cancelar
        </Boton>
        <Boton
          onClick={() => ajustar.mutate()}
          disabled={!cantidad || !motivo || ajustar.isPending}
          className="flex-1"
        >
          Guardar
        </Boton>
      </div>
    </div>
  );
}
