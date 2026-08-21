import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { D, formatMoney, money } from '@geovanny/shared';
import { api } from '../../lib/api';
import { useMoneda } from '../moneda/contexto';
import { Cargando, Tarjeta, Vacio } from '../../components/ui/base';
import { hoy as hoyDelDispositivo } from '../../components/ui/CampoFecha';

interface MovimientoDelDia {
  hora: string;
  tipo: 'VENTA' | 'COMPRA' | 'COBRO' | 'PAGO' | 'GASTO' | 'INVENTARIO';
  numero: string;
  titulo: string;
  detalle: string;
  monto: string;
  montoOriginal: string;
  monedaOriginal: string;
  entra: boolean | null;
}

interface DetalleDia {
  dia: string;
  esHoy: boolean;
  totales: {
    ventas: string;
    cantidadVentas: number;
    fiado: string;
    contado: string;
    cobros: string;
    compras: string;
    pagos: string;
    gastos: string;
    entroMenosSalio: string;
  };
  movimientos: MovimientoDelDia[];
}

interface ResumenDia {
  dia: string;
  esHoy: boolean;
  ventas: string;
  cantidadVentas: number;
  cobros: string;
  gastos: string;
}

const ETIQUETAS: Record<MovimientoDelDia['tipo'], { texto: string; color: string }> = {
  VENTA: { texto: 'Venta', color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' },
  COBRO: { texto: 'Abono', color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' },
  COMPRA: { texto: 'Viaje', color: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300' },
  PAGO: { texto: 'Pago', color: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300' },
  GASTO: { texto: 'Gasto', color: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300' },
  INVENTARIO: { texto: 'Inventario', color: 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300' },
};

/** `2026-08-20` → `jueves, 20 de agosto`. Se arma en local sin desfase de zona. */
function comoTexto(dia: string): string {
  const [anio, mes, numero] = dia.split('-').map(Number);
  const fecha = new Date(anio!, mes! - 1, numero!);
  return new Intl.DateTimeFormat('es-CO', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(fecha);
}

function sumarDias(dia: string, cantidad: number): string {
  const [anio, mes, numero] = dia.split('-').map(Number);
  const fecha = new Date(anio!, mes! - 1, numero! + cantidad);
  const dos = (n: number) => String(n).padStart(2, '0');
  return `${fecha.getFullYear()}-${dos(fecha.getMonth() + 1)}-${dos(fecha.getDate())}`;
}



/**
 * El día completo.
 *
 * Su cuaderno está organizado por día de venta: una columna por día. Aquí cada
 * día se abre y muestra TODO lo que se registró —ventas, abonos, viajes, gastos
 * y mermas— en el orden en que pasó, con los totales al final.
 */
export function Dias() {
  const { moneda } = useMoneda();
  const [elegido, setElegido] = useState<string | null>(null);

  const ultimos = useQuery({
    queryKey: ['dias', moneda],
    queryFn: () => api<ResumenDia[]>(`/dias?moneda=${moneda}&cantidad=14`),
  });

  // Cuál es "hoy" lo decide el servidor, que conoce la zona horaria del
  // negocio. El dispositivo puede estar en otra: a las 8 p. m. en Colombia el
  // reloj en UTC ya marca el día siguiente, y el día se vería equivocado.
  const hoyDelNegocio = ultimos.data?.[0]?.dia ?? hoyDelDispositivo();
  const dia = elegido ?? hoyDelNegocio;
  const setDia = setElegido;
  const esHoy = dia === hoyDelNegocio;

  const detalle = useQuery({
    queryKey: ['dia', dia, moneda],
    queryFn: () => api<DetalleDia>(`/dias/${dia}?moneda=${moneda}`),
  });

  return (
    <div className="space-y-4">
      <div>
        <Link to="/mas" className="text-sm opacity-60">
          ← Más
        </Link>
        <h1 className="text-xl font-bold">Por días</h1>
      </div>

      {/* Ir de un día a otro sin abrir un calendario. */}
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setDia(sumarDias(dia, -1))}
          className="min-h-[44px] rounded-lg border border-slate-300 px-4 text-lg dark:border-slate-700"
          aria-label="Día anterior"
        >
          ‹
        </button>
        <div className="text-center">
          <p className="font-semibold first-letter:uppercase">{comoTexto(dia)}</p>
          <p className="text-xs opacity-50">{esHoy ? 'hoy' : dia}</p>
        </div>
        <button
          type="button"
          onClick={() => setDia(sumarDias(dia, 1))}
          disabled={esHoy}
          className="min-h-[44px] rounded-lg border border-slate-300 px-4 text-lg disabled:opacity-30 dark:border-slate-700"
          aria-label="Día siguiente"
        >
          ›
        </button>
      </div>

      {detalle.isLoading ? (
        <Cargando />
      ) : detalle.data ? (
        <>
          <Tarjeta destacada>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs uppercase opacity-60">Vendido</p>
                <p className="tabular text-2xl font-semibold">
                  {formatMoney(money(detalle.data.totales.ventas, moneda))}
                </p>
                <p className="mt-1 text-xs opacity-60">
                  {detalle.data.totales.cantidadVentas}{' '}
                  {detalle.data.totales.cantidadVentas === 1 ? 'venta' : 'ventas'}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase opacity-60">Cobrado</p>
                <p className="tabular text-2xl font-semibold">
                  {formatMoney(money(detalle.data.totales.cobros, moneda))}
                </p>
                <p className="mt-1 text-xs opacity-60">abonos recibidos</p>
              </div>
            </div>

            <dl className="mt-4 space-y-1 border-t border-white/15 pt-3 text-sm">
              {[
                ['De contado', detalle.data.totales.contado],
                ['Fiado', detalle.data.totales.fiado],
                ['Comprado', detalle.data.totales.compras],
                ['Gastado', detalle.data.totales.gastos],
              ].map(([texto, valor]) => (
                <div key={texto} className="flex justify-between">
                  <dt className="opacity-70">{texto}</dt>
                  <dd className="tabular">{formatMoney(money(valor!, moneda))}</dd>
                </div>
              ))}
              <div className="flex justify-between border-t border-white/15 pt-2 font-semibold">
                <dt>Entró menos salió</dt>
                <dd className="tabular">
                  {formatMoney(money(detalle.data.totales.entroMenosSalio, moneda))}
                </dd>
              </div>
            </dl>
            <p className="mt-2 text-xs opacity-50">
              Lo fiado no entró como plata: quedó como deuda.
            </p>
          </Tarjeta>

          <Tarjeta titulo="Lo que se registró">
            {detalle.data.movimientos.length === 0 ? (
              <Vacio mensaje={esHoy ? 'Todavía no se ha registrado nada hoy.' : 'Ese día no se registró nada.'} />
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {detalle.data.movimientos.map((m, indice) => {
                  const etiqueta = ETIQUETAS[m.tipo];
                  const enOtraMoneda = m.monedaOriginal && m.monedaOriginal !== moneda;

                  return (
                    <li key={`${m.numero}-${indice}`} className="flex items-start gap-3 py-3">
                      <span className="tabular w-12 shrink-0 pt-0.5 text-xs opacity-50">
                        {m.hora}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span
                            className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${etiqueta.color}`}
                          >
                            {etiqueta.texto}
                          </span>
                          <span className="truncate font-medium">{m.titulo}</span>
                        </span>
                        <span className="mt-0.5 block truncate text-xs opacity-60">
                          {m.numero} · {m.detalle}
                        </span>
                      </span>
                      {m.tipo !== 'INVENTARIO' && (
                        <span className="shrink-0 text-right">
                          <span
                            className={`tabular block text-sm ${
                              m.entra === false ? 'opacity-70' : ''
                            }`}
                          >
                            {m.entra === false ? '−' : ''}
                            {formatMoney(money(m.monto, moneda))}
                          </span>
                          {enOtraMoneda && (
                            <span className="tabular block text-xs opacity-50">
                              {formatMoney(money(m.montoOriginal, m.monedaOriginal))}
                            </span>
                          )}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Tarjeta>
        </>
      ) : null}

      <Tarjeta titulo="Últimos días">
        {ultimos.isLoading ? (
          <Cargando />
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {(ultimos.data ?? []).map((resumen) => {
              const vacio = D(resumen.ventas).isZero() && D(resumen.cobros).isZero();
              return (
                <li key={resumen.dia}>
                  <button
                    type="button"
                    onClick={() => setDia(resumen.dia)}
                    className={`flex w-full items-center justify-between gap-3 py-2.5 text-left ${
                      resumen.dia === dia ? 'font-semibold' : ''
                    }`}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm first-letter:uppercase">
                        {comoTexto(resumen.dia)}
                        {resumen.esHoy && <span className="ml-1 text-xs opacity-50">· hoy</span>}
                      </span>
                      {!vacio && (
                        <span className="text-xs opacity-50">
                          {resumen.cantidadVentas}{' '}
                          {resumen.cantidadVentas === 1 ? 'venta' : 'ventas'}
                        </span>
                      )}
                    </span>
                    <span className="tabular shrink-0 text-right text-sm">
                      {vacio ? (
                        <span className="opacity-30">—</span>
                      ) : (
                        formatMoney(money(resumen.ventas, moneda))
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Tarjeta>
    </div>
  );
}
