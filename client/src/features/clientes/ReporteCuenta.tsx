import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { D, MONEDAS, formatMoney, money, type Moneda } from '@geovanny/shared';
import { api } from '../../lib/api';
import { Aviso, Boton, Cargando, Vacio } from '../../components/ui/base';
import type { Cargo, Operacion, Pago, Persona } from '../../lib/tipos';

/**
 * Estado de cuenta de una persona, hecho para el papel.
 *
 * **Una tabla por moneda, con saldo corrido.** Mezclar dólares y bolívares en
 * una sola columna de saldo daría un número que no existe (CN-2); separados,
 * cada línea enseña cómo quedó la cuenta después de ese movimiento, que es
 * justo lo que se discute cuando alguien reclama.
 *
 * Va de lo más viejo a lo más nuevo, al revés que la pantalla de la cuenta: en
 * papel una cuenta se lee hacia abajo, sumando.
 */

interface CuentaCompleta {
  persona: Persona;
  operaciones: Operacion[];
  pagos: Pago[];
  cargos: Cargo[];
}

interface Movimiento {
  fecha: string;
  numero: string;
  concepto: string;
  detalle: string | null;
  /** Lo que sube la deuda. */
  cargo: string;
  /** Lo que la baja. */
  abono: string;
}

const fechaCorta = (iso: string) =>
  new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: '2-digit' });

export function ReporteCuenta({ tipo = 'CLIENTE' }: { tipo?: 'CLIENTE' | 'PROVEEDOR' }) {
  const { id } = useParams<{ id: string }>();
  const esCliente = tipo === 'CLIENTE';

  const consulta = useQuery({
    queryKey: ['cuenta', id],
    queryFn: () => api<CuentaCompleta>(`/personas/${id}/cuenta`),
  });

  if (consulta.isLoading) return <Cargando />;
  if (consulta.isError || !consulta.data) {
    return <Aviso tono="error">No se pudo cargar la cuenta.</Aviso>;
  }

  const { persona, operaciones, pagos, cargos = [] } = consulta.data;
  const volverA = `/${esCliente ? 'clientes' : 'proveedores'}/${persona.id}`;

  /** Los movimientos de una moneda, de lo más viejo a lo más nuevo. */
  const movimientosDe = (m: Moneda): Movimiento[] =>
    [
      ...operaciones
        .filter((o) => o.moneda === m)
        .map((o) => ({
          fecha: o.fecha,
          numero: o.numero,
          concepto: o.tipo === 'COMPRA' ? 'Viaje' : 'Venta',
          detalle: o.items.map((i) => i.nombre.toLowerCase()).join(', ') || null,
          cargo: o.total.monto,
          abono: o.pagadoInicial,
        })),
      ...cargos
        .filter((c) => c.moneda === m)
        .map((c) => ({
          fecha: c.fecha,
          numero: c.numero,
          concepto: c.tipo === 'PRESTAMO' ? 'Préstamo' : 'Deuda',
          detalle: c.concepto,
          cargo: c.importe.monto,
          abono: '0',
        })),
      // Se aplica a la deuda en ESTA moneda aunque se haya pagado en otra: lo
      // que baja la cuenta es lo aplicado, no lo que se entregó.
      ...pagos
        .filter((p) => p.aplicaA === m)
        .map((p) => ({
          fecha: p.fecha,
          numero: p.numero,
          concepto: esCliente ? 'Abono' : 'Pago',
          detalle:
            p.importe.moneda === m
              ? p.metodo.toLowerCase()
              : `pagó ${formatMoney(money(p.importe.monto, p.importe.moneda))}`,
          cargo: '0',
          abono: p.montoAplicado,
        })),
    ].sort((a, b) => a.fecha.localeCompare(b.fecha));

  const conMovimientos = MONEDAS.filter(
    (m) => movimientosDe(m).length > 0 || !D(persona.saldos?.[m] ?? '0').isZero(),
  );

  return (
    <div className="space-y-5">
      <div data-noprint>
        <Link to={volverA} className="text-sm opacity-60">
          ← {persona.nombre}
        </Link>
      </div>

      <header className="flex items-start justify-between gap-3 border-b-2 border-slate-800 pb-3 dark:border-slate-300">
        <div>
          <p className="text-xs font-semibold tracking-widest uppercase opacity-50">Geovanny</p>
          <h1 className="text-2xl font-bold">{persona.nombre}</h1>
          <p className="text-xs opacity-60">
            Estado de cuenta · {esCliente ? 'cliente' : 'proveedor'}
            {persona.telefono ? ` · ${persona.telefono}` : ''} ·{' '}
            {new Date().toLocaleString('es-CO', {
              day: '2-digit',
              month: 'long',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </p>
        </div>
        <span data-noprint className="shrink-0">
          <Boton onClick={() => window.print()} className="px-4 text-sm">
            Guardar PDF
          </Boton>
        </span>
      </header>

      {conMovimientos.length === 0 ? (
        <Vacio mensaje="Esta cuenta no tiene movimientos." />
      ) : (
        conMovimientos.map((m) => {
          const movimientos = movimientosDe(m);
          let corrido = D(0);

          return (
            <section key={m} className="break-inside-avoid">
              <h2 className="mb-1 border-b border-slate-400 pb-1 text-base font-bold tracking-wide uppercase dark:border-slate-600">
                En {m === 'USD' ? 'dólares' : m === 'VES' ? 'bolívares' : 'pesos'}
              </h2>

              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="text-[10px] tracking-wide uppercase opacity-50">
                    <th className="py-1 font-semibold whitespace-nowrap">Fecha</th>
                    <th className="py-1 font-semibold">Concepto</th>
                    <th className="py-1 text-right font-semibold">Debe</th>
                    <th className="py-1 text-right font-semibold">
                      {esCliente ? 'Abonó' : 'Pagado'}
                    </th>
                    <th className="py-1 text-right font-semibold">Saldo</th>
                  </tr>
                </thead>
                <tbody>
                  {movimientos.map((mov, indice) => {
                    corrido = corrido.plus(D(mov.cargo)).minus(D(mov.abono));
                    return (
                      <tr
                        key={`${mov.numero}-${indice}`}
                        className="border-b border-slate-200 dark:border-slate-800"
                      >
                        <td className="tabular py-1.5 pr-2 text-xs whitespace-nowrap">
                          {fechaCorta(mov.fecha)}
                        </td>
                        <td className="py-1.5 pr-2">
                          <span className="text-xs font-medium">{mov.concepto}</span>
                          <span className="ml-1 text-[11px] opacity-40">{mov.numero}</span>
                          {mov.detalle && (
                            <span className="block truncate text-[11px] opacity-60">
                              {mov.detalle}
                            </span>
                          )}
                        </td>
                        <td className="tabular py-1.5 pr-2 text-right text-xs whitespace-nowrap">
                          {D(mov.cargo).isZero() ? '' : formatMoney(money(mov.cargo, m))}
                        </td>
                        <td className="tabular py-1.5 pr-2 text-right text-xs whitespace-nowrap">
                          {D(mov.abono).isZero() ? '' : formatMoney(money(mov.abono, m))}
                        </td>
                        <td className="tabular py-1.5 text-right text-xs font-semibold whitespace-nowrap">
                          {formatMoney(money(corrido.toString(), m))}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-800 dark:border-slate-300">
                    <td className="py-2 font-bold" colSpan={4}>
                      {esCliente ? 'Debe hoy' : 'Le debes hoy'}
                    </td>
                    <td className="tabular py-2 text-right text-base font-bold whitespace-nowrap">
                      {formatMoney(money(persona.saldos?.[m] ?? '0', m))}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </section>
          );
        })
      )}

      <p className="border-t border-slate-200 pt-2 text-xs opacity-50 dark:border-slate-800">
        Cada moneda es una cuenta aparte y no se suman entre ellas. El saldo de la última línea es
        el que queda hoy.
      </p>
    </div>
  );
}
