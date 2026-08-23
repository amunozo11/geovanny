import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { D, MONEDAS, cantidadTexto, conUnidad, formatMoney, formatRate, money } from '@geovanny/shared';
import { api } from '../../lib/api';
import { Aviso, Cargando, Tarjeta } from '../../components/ui/base';
import type { Operacion } from '../../lib/tipos';

/**
 * Una venta, entera.
 *
 * Lo que el cuaderno no puede responder: qué se llevó exactamente, a cómo, en
 * qué quedó y con qué tasa se calculó. Todo en una pantalla, sin tener que
 * cruzar dos hojas.
 */
export function DetalleVenta() {
  const { id } = useParams<{ id: string }>();

  const consulta = useQuery({
    queryKey: ['venta', id],
    queryFn: () => api<Operacion>(`/operaciones/${id}`),
  });

  if (consulta.isLoading) return <Cargando />;
  if (consulta.isError || !consulta.data) {
    return <Aviso tono="error">No se encontró la venta.</Aviso>;
  }

  const venta = consulta.data;
  const esCompra = venta.tipo === 'COMPRA';
  const debe = D(venta.saldo).greaterThan(0);
  const fecha = new Date(venta.fecha);

  return (
    <div className="space-y-4">
      <div>
        <Link to="/ventas" className="text-sm opacity-60">
          ← Todas las ventas
        </Link>
        <h1 className="text-xl font-bold">
          {esCompra ? 'Viaje' : 'Venta'} {venta.numero}
        </h1>
        <p className="text-sm opacity-60">
          {fecha.toLocaleDateString('es-CO', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}{' '}
          · {fecha.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>

      {venta.estado === 'ANULADA' && (
        <Aviso tono="atencion">
          Esta {esCompra ? 'compra' : 'venta'} está anulada
          {venta.motivoAnulacion ? `: ${venta.motivoAnulacion}` : '.'}
        </Aviso>
      )}

      <Tarjeta titulo={esCompra ? 'Proveedor' : 'Cliente'}>
        {venta.personaId ? (
          <Link
            to={`/${esCompra ? 'proveedores' : 'clientes'}/${venta.personaId}`}
            className="flex items-center justify-between gap-2"
          >
            <span className="font-semibold">{venta.personaNombre}</span>
            <span className="shrink-0 text-sm underline opacity-60">ver su cuenta</span>
          </Link>
        ) : (
          <>
            <p className="font-semibold">{venta.personaNombre}</p>
            <p className="text-xs opacity-60">
              Venta de mostrador: se cobró en el momento y no hay cliente al que cargarle nada.
            </p>
          </>
        )}
      </Tarjeta>

      {/* Lo que se llevó, línea por línea. Es lo que el cuaderno no guarda. */}
      <Tarjeta titulo="Qué se llevó">
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {venta.items.map((item, indice) => (
            <li key={`${item.nombre}-${indice}`} className="flex items-start justify-between gap-3 py-2.5">
              <span className="min-w-0">
                <span className="block truncate font-medium">{item.nombre}</span>
                <span className="tabular text-xs opacity-60">
                  {conUnidad(item.cantidad, item.unidad)} ×{' '}
                  {formatMoney(money(item.precio, venta.moneda))}
                </span>
              </span>
              <span className="tabular shrink-0 font-semibold">
                {formatMoney(money(item.subtotal, venta.moneda))}
              </span>
            </li>
          ))}
        </ul>

        <div className="mt-3 flex items-baseline justify-between border-t border-slate-200 pt-3 dark:border-slate-800">
          <span className="font-semibold">Total</span>
          <span className="tabular text-xl font-bold">
            {formatMoney(money(venta.total.monto, venta.moneda))}
          </span>
        </div>

        {/* Los equivalentes congelados el día de la venta: no se recalculan. */}
        <p className="tabular mt-1 text-right text-xs opacity-50">
          {MONEDAS.filter((m) => m !== venta.moneda)
            .map((m) => formatMoney(money(venta.total.eq[m], m)))
            .join(' · ')}
        </p>
      </Tarjeta>

      <Tarjeta titulo="Cómo quedó">
        <dl className="space-y-2 text-sm">
          <div className="flex items-baseline justify-between">
            <dt className="opacity-70">Forma de pago</dt>
            <dd className="font-medium">
              {venta.formaPago === 'FIADO'
                ? 'Fiado'
                : venta.formaPago === 'CONTADO'
                  ? 'Contado'
                  : 'Abonó una parte'}
            </dd>
          </div>
          <div className="flex items-baseline justify-between">
            <dt className="opacity-70">Pagado</dt>
            <dd className="tabular">{formatMoney(money(venta.pagado, venta.moneda))}</dd>
          </div>
          <div className="flex items-baseline justify-between border-t border-slate-200 pt-2 dark:border-slate-800">
            <dt className="font-semibold">{debe ? 'Debe' : 'Saldo'}</dt>
            <dd
              className={`tabular text-lg font-bold ${debe ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}
            >
              {formatMoney(money(venta.saldo, venta.moneda))}
            </dd>
          </div>
        </dl>

        {venta.nota && <p className="mt-3 text-xs opacity-60">{venta.nota}</p>}

        {venta.personaId && (
          <p className="mt-3 text-xs opacity-50">
            Para corregirla, cobrarla o quitarla, entra en la cuenta de {venta.personaNombre}.
          </p>
        )}
      </Tarjeta>

      <Tarjeta titulo="Con qué tasa se calculó">
        <p className="tabular text-sm">{formatRate('USD', 'COP', venta.total.tasa.usdCop)}</p>
        <p className="tabular text-sm">{formatRate('USD', 'VES', venta.total.tasa.usdVes)}</p>
        <p className="mt-2 text-xs opacity-60">
          Es la tasa del día en que se registró, y no cambia: esta venta seguirá valiendo lo mismo
          aunque hoy el dólar esté a otro precio.
        </p>
      </Tarjeta>

      {/* Para que el número de arriba se pueda leer sin saber de decimales. */}
      <p className="text-center text-xs opacity-40">
        {venta.items.reduce((acc, i) => acc + Number(i.cantidad), 0) > 0 &&
          `${cantidadTexto(
            venta.items.reduce((acc, i) => D(acc).plus(D(i.cantidad)).toString(), '0'),
          )} en total`}
      </p>
    </div>
  );
}
