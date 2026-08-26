import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { D, MONEDAS, formatMoney, money, type Moneda } from '@geovanny/shared';
import { api } from '../../lib/api';
import { Aviso, Boton, Cargando, Vacio } from '../../components/ui/base';

/**
 * El reporte de deudas, listo para imprimir. Sirve para las dos direcciones.
 *
 * **Una sección por moneda, no una columna por moneda.** Los dólares y los
 * bolívares son cuentas separadas (CN-2): un total que los sumara sería un
 * número que no existe. Separándolos, cada bloque tiene su total y ese total sí
 * significa algo — es lo que hay que cobrar en billetes de esa moneda.
 *
 * Dentro de cada bloque va de mayor a menor, que es el orden en que se cobra.
 *
 * El PDF sale por la impresión del navegador —"Guardar como PDF", que en
 * Android e iOS también está—. No hace falta una librería de PDF de medio mega
 * para una tabla, y así el papel sale exactamente igual que la pantalla.
 */

interface FilaDeuda {
  id: string;
  nombre: string;
  telefono: string | null;
  saldos: Partial<Record<Moneda, string>>;
}

interface Reporte {
  generado: string;
  filas: FilaDeuda[];
  total: Record<Moneda, string>;
}

const NOMBRE_MONEDA: Record<Moneda, string> = {
  COP: 'En pesos',
  USD: 'En dólares',
  VES: 'En bolívares',
};

export function Deudas({ tipo = 'CLIENTE' }: { tipo?: 'CLIENTE' | 'PROVEEDOR' }) {
  const esCliente = tipo === 'CLIENTE';

  const consulta = useQuery({
    queryKey: ['deudas', tipo],
    queryFn: () => api<Reporte>(`/personas/deudas?tipo=${tipo}`),
  });

  if (consulta.isLoading) return <Cargando />;
  if (consulta.isError || !consulta.data) {
    return <Aviso tono="error">No se pudo cargar el reporte. Revisa la conexión.</Aviso>;
  }

  const { filas, total, generado } = consulta.data;

  /** Los que deben en esta moneda, del que más debe al que menos. */
  const enMoneda = (m: Moneda) =>
    filas
      .filter((f) => D(f.saldos[m] ?? '0').greaterThan(0))
      .sort((a, b) => D(b.saldos[m]!).comparedTo(D(a.saldos[m]!)));

  const conDeuda = MONEDAS.filter((m) => enMoneda(m).length > 0);

  // Un saldo negativo es plata a favor, no una deuda: no puede colarse entre lo
  // que hay que cobrar, pero tampoco desaparecer sin más.
  const aFavor = filas.flatMap((f) =>
    MONEDAS.filter((m) => D(f.saldos[m] ?? '0').isNegative()).map((m) => ({
      nombre: f.nombre,
      moneda: m,
      monto: D(f.saldos[m]!).abs().toString(),
    })),
  );

  return (
    <div className="space-y-5">
      <div data-noprint>
        <Link to={esCliente ? '/clientes' : '/mas'} className="text-sm opacity-60">
          ← {esCliente ? 'Clientes' : 'Más'}
        </Link>
      </div>

      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">
            {esCliente ? 'Cuentas por cobrar' : 'Cuentas por pagar'}
          </h1>
          <p className="text-xs opacity-60">
            {esCliente ? 'Lo que me deben los clientes' : 'Lo que le debo a los proveedores'} ·{' '}
            {new Date(generado).toLocaleString('es-CO')}
          </p>
        </div>
        {conDeuda.length > 0 && (
          // El botón se envuelve porque `Boton` no reenvía atributos sueltos:
          // sin esto, "Guardar PDF" saldría impreso dentro del propio PDF.
          <span data-noprint className="shrink-0">
            <Boton onClick={() => window.print()} className="px-4 text-sm">
              Guardar PDF
            </Boton>
          </span>
        )}
      </div>

      {conDeuda.length === 0 ? (
        <Vacio
          mensaje={esCliente ? 'Nadie te debe nada ahora mismo.' : 'No le debes nada a nadie.'}
        />
      ) : (
        conDeuda.map((m) => {
          const lista = enMoneda(m);
          return (
            <section
              key={m}
              className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
            >
              <header className="flex items-baseline justify-between gap-3 border-b border-slate-200 px-4 py-2.5 dark:border-slate-700">
                <h2 className="font-bold">{NOMBRE_MONEDA[m]}</h2>
                <span className="text-xs opacity-60">
                  {lista.length} {lista.length === 1 ? 'cuenta' : 'cuentas'}
                </span>
              </header>

              <table className="w-full border-collapse text-left text-sm">
                <tbody>
                  {lista.map((fila) => (
                    <tr
                      key={fila.id}
                      className="border-b border-slate-100 dark:border-slate-800"
                    >
                      <td className="px-4 py-2">
                        <span className="font-medium">{fila.nombre}</span>
                        {fila.telefono && (
                          <span className="block text-xs opacity-60">{fila.telefono}</span>
                        )}
                      </td>
                      <td className="tabular px-4 py-2 text-right font-semibold whitespace-nowrap">
                        {formatMoney(money(fila.saldos[m]!, m))}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-300 dark:border-slate-600">
                    <td className="px-4 py-2.5 font-bold">Total {NOMBRE_MONEDA[m].toLowerCase()}</td>
                    <td className="tabular px-4 py-2.5 text-right text-lg font-bold whitespace-nowrap">
                      {formatMoney(money(total[m], m))}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </section>
          );
        })
      )}

      {aFavor.length > 0 && (
        <section className="rounded-xl border border-dashed border-slate-300 px-4 py-3 dark:border-slate-700">
          <h2 className="text-xs font-semibold tracking-wide uppercase opacity-60">
            {esCliente ? 'Tienen saldo a favor' : 'Tienes saldo a favor'}
          </h2>
          <ul className="mt-2 space-y-1">
            {aFavor.map((f) => (
              <li key={`${f.nombre}-${f.moneda}`} className="flex justify-between gap-3 text-sm">
                <span className="truncate">{f.nombre}</span>
                <span className="tabular shrink-0">
                  {formatMoney(money(f.monto, f.moneda))}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs opacity-50">
            Pagaron de más. Se descuenta solo en su próxima compra.
          </p>
        </section>
      )}

      {conDeuda.length > 1 && (
        <p className="text-xs opacity-50">
          Cada moneda va por separado y no se suman entre ellas: son cuentas distintas.
        </p>
      )}
    </div>
  );
}
