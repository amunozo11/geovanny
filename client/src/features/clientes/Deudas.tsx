import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { D, MONEDAS, formatMoney, money, type Moneda } from '@geovanny/shared';
import { api } from '../../lib/api';
import { Aviso, Boton, Cargando, Vacio } from '../../components/ui/base';

/**
 * El reporte de deudas, hecho para el papel. Sirve para las dos direcciones.
 *
 * **Una sección por moneda, no una columna por moneda.** Los dólares y los
 * bolívares son cuentas separadas (CN-2): un total que los sumara sería un
 * número que no existe. Separándolos, cada bloque tiene su total y ese total sí
 * significa algo — es lo que hay que cobrar en billetes de esa moneda.
 *
 * Dentro de cada bloque va **del más viejo al más nuevo**, no del que más debe
 * al que menos. Una deuda de cien dólares de hace tres meses aprieta más que
 * una de mil de anteayer, y esta es la hoja con la que se sale a la calle.
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
  desde: Partial<Record<Moneda, string | null>>;
}

interface Reporte {
  generado: string;
  filas: FilaDeuda[];
  total: Record<Moneda, string>;
}

const NOMBRE_MONEDA: Record<Moneda, string> = {
  COP: 'En pesos colombianos',
  USD: 'En dólares',
  VES: 'En bolívares',
};

const fechaCorta = (iso: string) =>
  new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: '2-digit' });

/** "hace 12 días": lo que de verdad dice si un cobro se está enfriando. */
function antiguedad(iso: string): string {
  const dias = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (dias <= 0) return 'hoy';
  if (dias === 1) return 'ayer';
  if (dias < 30) return `${dias} días`;
  const meses = Math.floor(dias / 30);
  return meses === 1 ? '1 mes' : `${meses} meses`;
}

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

  /** Los que deben en esta moneda, del más viejo al más reciente. */
  const enMoneda = (m: Moneda) =>
    filas
      .filter((f) => D(f.saldos[m] ?? '0').greaterThan(0))
      .sort((a, b) => {
        const desdeA = a.desde?.[m];
        const desdeB = b.desde?.[m];
        if (!desdeA && !desdeB) return a.nombre.localeCompare(b.nombre);
        if (!desdeA) return 1;
        if (!desdeB) return -1;
        return desdeA.localeCompare(desdeB);
      });

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

      {/* Encabezado del papel: qué es, de quién y de cuándo. */}
      <header className="flex items-start justify-between gap-3 border-b-2 border-slate-800 pb-3 dark:border-slate-300">
        <div>
          <p className="text-xs font-semibold tracking-widest uppercase opacity-50">Geovanny</p>
          <h1 className="text-2xl font-bold">
            {esCliente ? 'Cuentas por cobrar' : 'Cuentas por pagar'}
          </h1>
          <p className="text-xs opacity-60">
            {esCliente ? 'Lo que me deben los clientes' : 'Lo que le debo a los proveedores'} ·{' '}
            {new Date(generado).toLocaleString('es-CO', {
              day: '2-digit',
              month: 'long',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
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
      </header>

      {conDeuda.length === 0 ? (
        <Vacio
          mensaje={esCliente ? 'Nadie te debe nada ahora mismo.' : 'No le debes nada a nadie.'}
        />
      ) : (
        conDeuda.map((m) => {
          const lista = enMoneda(m);
          return (
            <section key={m} className="break-inside-avoid">
              <h2 className="mb-1 flex items-baseline justify-between gap-3 border-b border-slate-400 pb-1 dark:border-slate-600">
                <span className="text-base font-bold tracking-wide uppercase">
                  {NOMBRE_MONEDA[m]}
                </span>
                <span className="text-xs font-normal opacity-60">
                  {lista.length} {lista.length === 1 ? 'cuenta' : 'cuentas'}
                </span>
              </h2>

              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="text-[10px] tracking-wide uppercase opacity-50">
                    <th className="py-1 font-semibold">Nombre</th>
                    <th className="py-1 font-semibold whitespace-nowrap">Debe desde</th>
                    <th className="py-1 text-right font-semibold">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {lista.map((fila) => {
                    const desde = fila.desde?.[m];
                    return (
                      <tr
                        key={fila.id}
                        className="border-b border-slate-200 dark:border-slate-800"
                      >
                        <td className="py-1.5 pr-2">
                          <span className="font-medium">{fila.nombre}</span>
                          {fila.telefono && (
                            <span className="block text-[11px] opacity-60">{fila.telefono}</span>
                          )}
                        </td>
                        <td className="tabular py-1.5 pr-2 text-xs whitespace-nowrap">
                          {desde ? (
                            <>
                              {fechaCorta(desde)}
                              <span className="block text-[11px] opacity-50">
                                {antiguedad(desde)}
                              </span>
                            </>
                          ) : (
                            <span className="opacity-40">—</span>
                          )}
                        </td>
                        <td className="tabular py-1.5 text-right font-semibold whitespace-nowrap">
                          {formatMoney(money(fila.saldos[m]!, m))}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-800 dark:border-slate-300">
                    <td className="py-2 font-bold" colSpan={2}>
                      Total {NOMBRE_MONEDA[m].toLowerCase()}
                    </td>
                    <td className="tabular py-2 text-right text-base font-bold whitespace-nowrap">
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
        <section className="break-inside-avoid border-t border-dashed border-slate-400 pt-3 dark:border-slate-600">
          <h2 className="text-xs font-semibold tracking-wide uppercase opacity-60">
            {esCliente ? 'Tienen saldo a favor' : 'Tienes saldo a favor'}
          </h2>
          <ul className="mt-2 space-y-1">
            {aFavor.map((f) => (
              <li key={`${f.nombre}-${f.moneda}`} className="flex justify-between gap-3 text-sm">
                <span className="truncate">{f.nombre}</span>
                <span className="tabular shrink-0">{formatMoney(money(f.monto, f.moneda))}</span>
              </li>
            ))}
          </ul>
          <p className="mt-1 text-xs opacity-50">
            Pagaron de más. Se descuenta solo en su próxima compra.
          </p>
        </section>
      )}

      {conDeuda.length > 0 && (
        <p className="border-t border-slate-200 pt-2 text-xs opacity-50 dark:border-slate-800">
          Ordenado por antigüedad: primero lo que lleva más tiempo sin pagarse. Cada moneda va por
          separado y no se suman entre ellas — son cuentas distintas.
        </p>
      )}
    </div>
  );
}
