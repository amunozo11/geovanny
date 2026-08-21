import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { MONEDAS, formatMoney, money, D } from '@geovanny/shared';
import { api } from '../../lib/api';
import { Tarjeta } from '../../components/ui/base';
import type { Persona } from '../../lib/tipos';

const OPCIONES = [
  { a: '/mas/dias', titulo: 'Por días', texto: 'Todo lo que se registró cada día' },
  { a: '/mas/comprar', titulo: 'Registrar viaje', texto: 'Mercancía que entra, con su cargue' },
  { a: '/mas/cajas', titulo: 'Cajas', texto: 'Dónde está el dinero y cuánto hay' },
  { a: '/mas/tasas', titulo: 'Tasa del día', texto: 'A cómo está el dólar hoy' },
  { a: '/mas/gastos', titulo: 'Gastos', texto: 'Transporte, combustible, arriendo…' },
];

export function Mas() {
  const proveedores = useQuery({
    queryKey: ['personas', 'PROVEEDOR', ''],
    queryFn: () => api<Persona[]>('/personas?tipo=PROVEEDOR'),
  });

  const conDeuda = (proveedores.data ?? []).filter((p) =>
    MONEDAS.some((m) => D(p.saldos?.[m] ?? '0').greaterThan(0)),
  );

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Más</h1>

      <div className="space-y-2">
        {OPCIONES.map((opcion) => (
          <Link
            key={opcion.a}
            to={opcion.a}
            className="block rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
          >
            <p className="font-semibold">{opcion.titulo}</p>
            <p className="text-xs opacity-60">{opcion.texto}</p>
          </Link>
        ))}
      </div>

      <Tarjeta titulo="A quién le debes">
        {conDeuda.length === 0 ? (
          <p className="py-2 text-sm opacity-60">No le debes a ningún proveedor.</p>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {conDeuda.map((proveedor) => (
              <li key={proveedor.id}>
                <Link
                  to={`/proveedores/${proveedor.id}`}
                  className="flex items-center justify-between gap-3 py-3"
                >
                  <span className="truncate font-medium">{proveedor.nombre}</span>
                  <span className="tabular shrink-0 text-right text-sm">
                    {MONEDAS.filter((m) => Number(proveedor.saldos?.[m] ?? '0') !== 0).map((m) => (
                      <span key={m} className="block">
                        {formatMoney(money(proveedor.saldos[m]!, m))}
                      </span>
                    ))}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Tarjeta>
    </div>
  );
}
