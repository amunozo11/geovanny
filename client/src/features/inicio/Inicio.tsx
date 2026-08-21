import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  MONEDAS,
  conUnidad,
  formatMoney,
  formatRate,
  money,
  type Importe,
  type Moneda,
} from '@geovanny/shared';
import { api } from '../../lib/api';
import { useMoneda } from '../moneda/contexto';
import { Plata } from '../../components/ui/Plata';
import { Aviso, Boton, Cargando, Tarjeta, Vacio } from '../../components/ui/base';

interface Saldos {
  porMoneda: Record<string, string>;
  total: string;
}

interface Resumen {
  sinTasa: false;
  moneda: Moneda;
  tasa: { usdCop: string; usdVes: string; mercado: string; fuente: string; at: string };
  tasaAntiguedadHoras: number | null;
  meDeben: Saldos;
  debo: Saldos;
  diferencia: string;
  ventasHoy: string;
  cantidadVentasHoy: number;
  cobradoHoy: string;
  ventasMes: string;
  comprasMes: string;
  gastosMes: string;
  utilidadMes: { bruta: string; gastos: string; neta: string };
  inventario: {
    valor: string;
    productos: number;
    stockBajo: { id: string; nombre: string; stock: string; unidad: string }[];
  };
  dinero: {
    total: string;
    cajas: {
      id: string;
      nombre: string;
      moneda: Moneda;
      saldo: string;
      convertido: string;
    }[];
  };
  deudoresTop: { id: string; nombre: string; total: string; saldos: Record<string, string> }[];
  ultimasVentas: {
    id: string;
    numero: string;
    persona: string;
    fecha: string;
    formaPago: string;
    saldo: string;
    moneda: Moneda;
    total: Importe;
  }[];
}

type RespuestaResumen = Resumen | { sinTasa: true };

/**
 * Detalle de la deuda moneda por moneda, como él la lleva: cuentas separadas
 * (CN-2). Se omite cuando no aporta nada —una sola moneda, y además la misma
 * que se está viendo— para no repetir la misma cifra dos veces seguidas.
 */
function DesgloseMonedas({ saldos, viendo }: { saldos: Saldos; viendo: Moneda }) {
  const conSaldo = MONEDAS.filter((m) => Number(saldos.porMoneda[m] ?? '0') !== 0);
  if (conSaldo.length === 0) return null;
  if (conSaldo.length === 1 && conSaldo[0] === viendo) return null;

  return (
    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs opacity-70">
      {conSaldo.map((m) => (
        <span key={m} className="tabular">
          {formatMoney(money(saldos.porMoneda[m] ?? '0', m))}
        </span>
      ))}
    </div>
  );
}

export function Inicio() {
  const { moneda } = useMoneda();

  const consulta = useQuery({
    queryKey: ['resumen', moneda],
    queryFn: () => api<RespuestaResumen>(`/resumen?moneda=${moneda}`),
  });

  if (consulta.isLoading) return <Cargando />;
  if (consulta.isError) {
    return <Aviso tono="error">No se pudo cargar el inicio. Revisa la conexión.</Aviso>;
  }

  const datos = consulta.data!;

  // Sin tasa no se puede convertir nada, y no se inventa ningún número.
  if (datos.sinTasa) {
    return (
      <Tarjeta titulo="Falta la tasa del día">
        <p className="text-sm">
          Para poder mostrar las cifras en pesos, dólares y bolívares hace falta saber a cómo está
          el dólar hoy. Es lo único que necesitas antes de empezar.
        </p>
        <Link to="/mas/tasas" className="mt-4 block">
          <Boton className="w-full">Poner la tasa de hoy</Boton>
        </Link>
      </Tarjeta>
    );
  }

  const r = datos;
  const tasaVieja = (r.tasaAntiguedadHoras ?? 0) > 12;
  const aFavor = Number(r.diferencia) >= 0;

  return (
    <div className="space-y-4">
      {tasaVieja && (
        <Aviso tono="atencion">
          La tasa es de hace {Math.round(r.tasaAntiguedadHoras ?? 0)} horas.{' '}
          <Link to="/mas/tasas" className="font-semibold underline">
            Actualizar
          </Link>
        </Aviso>
      )}

      {/* La pregunta que se hace todos los días: cuánto debo contra cuánto me deben. */}
      <Tarjeta destacada>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs uppercase opacity-60">Me deben</p>
            <Plata monto={r.meDeben.total} moneda={moneda} tamano="grande" />
            <DesgloseMonedas saldos={r.meDeben} viendo={moneda} />
          </div>
          <div>
            <p className="text-xs uppercase opacity-60">Debo</p>
            <Plata monto={r.debo.total} moneda={moneda} tamano="grande" />
            <DesgloseMonedas saldos={r.debo} viendo={moneda} />
          </div>
        </div>

        <div className="mt-4 border-t border-white/15 pt-3">
          <p className="text-xs uppercase opacity-60">Diferencia</p>
          <p className={`tabular text-xl font-semibold ${aFavor ? '' : 'text-amber-300'}`}>
            {formatMoney(money(r.diferencia, moneda))}
          </p>
          <p className="mt-1 text-xs opacity-60">
            {aFavor
              ? 'Te deben más de lo que debes.'
              : 'Debes más de lo que te deben. Es lo que falta por cubrir.'}
          </p>
        </div>
      </Tarjeta>

      {r.dinero.cajas.length > 0 && (
        <Tarjeta titulo="Dinero que tengo">
          <Plata monto={r.dinero.total} moneda={moneda} tamano="grande" />
          <ul className="mt-3 space-y-1">
            {r.dinero.cajas.map((caja) => (
              <li key={caja.id} className="flex items-baseline justify-between text-sm">
                <span className="opacity-70">{caja.nombre}</span>
                <span className="tabular">
                  {formatMoney(money(caja.saldo, caja.moneda))}
                </span>
              </li>
            ))}
          </ul>
          <Link to="/mas/cajas" className="mt-3 inline-block text-sm underline opacity-70">
            Ver cajas
          </Link>
        </Tarjeta>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Link to="/mas/dias" className="block">
          <Tarjeta titulo="Vendido hoy">
            <Plata monto={r.ventasHoy} moneda={moneda} tamano="grande" />
            <p className="mt-1 text-xs opacity-60">
              {r.cantidadVentasHoy} {r.cantidadVentasHoy === 1 ? 'venta' : 'ventas'} · ver el día
            </p>
          </Tarjeta>
        </Link>
        <Tarjeta titulo="Recibido hoy">
          <Plata monto={r.cobradoHoy} moneda={moneda} tamano="grande" />
          <p className="mt-1 text-xs opacity-60">abonos y ventas de contado</p>
        </Tarjeta>
      </div>

      <Tarjeta titulo="Este mes">
        <dl className="space-y-2 text-sm">
          {[
            ['Ventas', r.ventasMes],
            ['Compras', r.comprasMes],
            ['Gastos', r.gastosMes],
          ].map(([texto, valor]) => (
            <div key={texto} className="flex items-baseline justify-between">
              <dt className="opacity-70">{texto}</dt>
              <dd>
                <Plata monto={valor!} moneda={moneda} />
              </dd>
            </div>
          ))}
          <div className="flex items-baseline justify-between border-t border-slate-200 pt-2 dark:border-slate-800">
            <dt className="font-semibold">Ganancia</dt>
            <dd className="font-semibold">
              <Plata monto={r.utilidadMes.neta} moneda={moneda} />
            </dd>
          </div>
        </dl>
        <p className="mt-2 text-xs opacity-50">
          Ganancia = lo que vendiste menos lo que te costó la mercancía, menos los gastos.
        </p>
      </Tarjeta>

      <Tarjeta titulo="Inventario">
        <div className="flex items-baseline justify-between">
          <Plata monto={r.inventario.valor} moneda={moneda} tamano="grande" />
          <Link to="/inventario" className="text-sm underline opacity-70">
            {r.inventario.productos} productos
          </Link>
        </div>
        {r.inventario.stockBajo.length > 0 && (
          <div className="mt-3 space-y-1">
            {r.inventario.stockBajo.map((p) => (
              <p key={p.id} className="text-xs text-amber-600 dark:text-amber-400">
                Queda poco: {p.nombre} · {conUnidad(p.stock, p.unidad)}
              </p>
            ))}
          </div>
        )}
      </Tarjeta>

      <Tarjeta titulo="Quién te debe">
        {r.deudoresTop.length === 0 ? (
          <Vacio mensaje="Nadie te debe nada ahora mismo." />
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {r.deudoresTop.map((cliente) => (
              <li key={cliente.id}>
                <Link
                  to={`/clientes/${cliente.id}`}
                  className="flex items-center justify-between gap-2 py-3"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{cliente.nombre}</span>
                    <span className="text-xs opacity-50">
                      {MONEDAS.filter((m) => Number(cliente.saldos[m] ?? '0') !== 0)
                        .map((m) => formatMoney(money(cliente.saldos[m] ?? '0', m)))
                        .join(' · ')}
                    </span>
                  </span>
                  <Plata monto={cliente.total} moneda={moneda} className="shrink-0 text-right" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Tarjeta>

      <Tarjeta titulo="Últimas ventas">
        {r.ultimasVentas.length === 0 ? (
          <Vacio
            mensaje="Todavía no has registrado ventas."
            accion={
              <Link to="/vender">
                <Boton>Registrar la primera</Boton>
              </Link>
            }
          />
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {r.ultimasVentas.map((venta) => (
              <li key={venta.id} className="flex items-center justify-between gap-2 py-3">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{venta.persona}</span>
                  <span className="text-xs opacity-50">
                    {venta.numero} ·{' '}
                    {Number(venta.saldo) > 0 ? (
                      <span className="text-amber-600 dark:text-amber-400">fiado</span>
                    ) : (
                      'pagado'
                    )}
                  </span>
                </span>
                <Plata importe={venta.total} className="shrink-0 text-right" />
              </li>
            ))}
          </ul>
        )}
      </Tarjeta>

      {/* Explicar de dónde salen las conversiones evita el problema que hoy
          tiene su Excel: cada hoja usaba una tasa distinta (E-1). */}
      <Tarjeta titulo="Cómo se calcularon estas cifras">
        <p className="tabular text-sm">{formatRate('USD', 'COP', r.tasa.usdCop)}</p>
        <p className="tabular text-sm">{formatRate('USD', 'VES', r.tasa.usdVes)}</p>
        <p className="mt-2 text-xs opacity-60">
          Tasa {r.tasa.mercado.toLowerCase()} · {r.tasa.fuente === 'API' ? 'de internet' : 'puesta a mano'} ·{' '}
          {new Date(r.tasa.at).toLocaleString('es-CO')}
        </p>
        <p className="mt-3 text-xs opacity-60">
          Las ventas y compras se muestran con la tasa que tenían el día que se hicieron. Las
          deudas y el inventario, con la tasa de hoy, porque es lo que valen hoy.
        </p>
        <Link to="/mas/tasas" className="mt-3 inline-block text-sm underline">
          Ver o cambiar la tasa
        </Link>
      </Tarjeta>
    </div>
  );
}
