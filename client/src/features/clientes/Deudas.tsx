import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { D, MONEDAS, formatMoney, money, type Moneda } from '@geovanny/shared';
import { api } from '../../lib/api';
import { Aviso, Boton, Cargando, Vacio } from '../../components/ui/base';

/**
 * La hoja de cobro: quién debe, desde cuándo, qué se llevó y cuánto.
 *
 * Va **resumida y no detallada** a propósito. El detalle venta a venta ya está
 * en la cuenta de cada quien; en la hoja con la que se sale a la calle solo
 * estorba, porque lo que se necesita ahí es un renglón por persona que quepa de
 * un vistazo.
 *
 * El PDF sale por la impresión del navegador —"Guardar como PDF" en el diálogo,
 * que en Android e iOS también está—. No hace falta cargar una librería de PDF
 * de medio mega para generar una tabla, y así el papel sale exactamente igual
 * que lo que se ve en pantalla.
 */

interface FilaDeuda {
  id: string;
  nombre: string;
  telefono: string | null;
  desde: string | null;
  documentos: number;
  debe: string[];
  saldos: Partial<Record<Moneda, string>>;
}

interface Deudas {
  generado: string;
  filas: FilaDeuda[];
  total?: Record<Moneda, string>;
}

const fechaCorta = (iso: string) =>
  new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: '2-digit' });

/** "hace 12 días": lo que de verdad dice si un cobro se está enfriando. */
function antiguedad(iso: string): string {
  const dias = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (dias <= 0) return 'hoy';
  if (dias === 1) return 'hace 1 día';
  return `hace ${dias} días`;
}

export function Deudas() {
  const consulta = useQuery({
    queryKey: ['deudas', 'CLIENTE'],
    queryFn: () => api<Deudas>('/personas/deudas?tipo=CLIENTE'),
  });

  if (consulta.isLoading) return <Cargando />;
  if (consulta.isError || !consulta.data) {
    return <Aviso tono="error">No se pudo cargar la lista. Revisa la conexión.</Aviso>;
  }

  const { filas, total } = consulta.data;
  const monedas = MONEDAS.filter((m) => filas.some((f) => !D(f.saldos[m] ?? '0').isZero()));

  return (
    <div className="space-y-4">
      <div data-noprint>
        <Link to="/clientes" className="text-sm opacity-60">
          ← Clientes
        </Link>
      </div>

      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Quién me debe</h1>
          <p className="text-xs opacity-60">
            {filas.length} {filas.length === 1 ? 'cliente' : 'clientes'} con saldo pendiente ·{' '}
            {new Date(consulta.data.generado).toLocaleString('es-CO')}
          </p>
        </div>
        {filas.length > 0 && (
          // El botón se envuelve porque `Boton` no reenvía atributos sueltos:
          // sin esto, "Guardar PDF" saldría impreso dentro del propio PDF.
          <span data-noprint className="shrink-0">
            <Boton onClick={() => window.print()} className="px-4 text-sm">
              Guardar PDF
            </Boton>
          </span>
        )}
      </div>

      {filas.length === 0 ? (
        <Vacio mensaje="Nadie te debe nada ahora mismo." />
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <table className="w-full min-w-[36rem] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase opacity-60 dark:border-slate-700">
                  <th className="px-3 py-2 font-semibold">Cliente</th>
                  <th className="px-3 py-2 font-semibold">Desde</th>
                  <th className="px-3 py-2 font-semibold">Qué debe</th>
                  <th className="px-3 py-2 text-right font-semibold">Cuánto</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((fila) => (
                  <tr
                    key={fila.id}
                    className="border-b border-slate-100 align-top last:border-0 dark:border-slate-800"
                  >
                    <td className="px-3 py-2">
                      <span className="font-semibold">{fila.nombre}</span>
                      {fila.telefono && (
                        <span className="block text-xs opacity-60">{fila.telefono}</span>
                      )}
                    </td>
                    <td className="tabular px-3 py-2 whitespace-nowrap">
                      {fila.desde ? (
                        <>
                          {fechaCorta(fila.desde)}
                          <span className="block text-xs opacity-60">{antiguedad(fila.desde)}</span>
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {fila.debe.length > 0 ? fila.debe.join(' · ') : 'saldo pendiente'}
                      {fila.documentos > 1 && (
                        <span className="block opacity-50">{fila.documentos} documentos</span>
                      )}
                    </td>
                    <td className="tabular px-3 py-2 text-right whitespace-nowrap">
                      {MONEDAS.filter((m) => !D(fila.saldos[m] ?? '0').isZero()).map((m) => (
                        <span key={m} className="block font-semibold">
                          {formatMoney(money(fila.saldos[m]!, m))}
                        </span>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
              {total && (
                <tfoot>
                  <tr className="border-t-2 border-slate-300 dark:border-slate-600">
                    <td className="px-3 py-2 font-bold" colSpan={3}>
                      Total
                    </td>
                    <td className="tabular px-3 py-2 text-right">
                      {monedas.map((m) => (
                        <span key={m} className="block font-bold">
                          {formatMoney(money(total[m], m))}
                        </span>
                      ))}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          {/* Sumar deudas en monedas distintas daría un número que no existe:
              cada moneda es una cuenta aparte, como en su cuaderno (CN-2). */}
          <p className="text-xs opacity-50">
            Cada moneda va por separado: no se suman entre ellas. Solo aparece lo que está sin
            pagar.
          </p>
        </>
      )}
    </div>
  );
}
