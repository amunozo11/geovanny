import { NavLink, Outlet } from 'react-router-dom';
import { SelectorMoneda } from '../features/moneda/MonedaContext';
import { useAuth } from '../features/auth/AuthContext';

const SECCIONES = [
  { a: '/', texto: 'Inicio', icono: '🏠' },
  { a: '/inventario', texto: 'Inventario', icono: '📦' },
  { a: '/vender', texto: 'Fiado', icono: '＋', destacado: true },
  { a: '/ventas-totales', texto: 'Ventas', icono: '🧾' },
  { a: '/clientes', texto: 'Clientes', icono: '👥' },
  { a: '/mas', texto: 'Todo', icono: '☰' },
];

export function Layout() {
  const { user, logout, accesoAbierto } = useAuth();

  return (
    <div className="mx-auto min-h-dvh w-full max-w-3xl">
      {/* El selector de moneda vive arriba y siempre visible: es el mando que
          cambia todas las cifras de la aplicación. */}
      <header
        data-noprint
        className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-bold">Geovanny</p>
            {accesoAbierto ? (
              <span className="text-xs opacity-50">{user?.name}</span>
            ) : (
              <button
                type="button"
                onClick={() => void logout()}
                className="text-xs opacity-50 hover:underline"
              >
                {user?.name} · salir
              </button>
            )}
          </div>
          <div className="text-right">
            <p className="mb-1 text-[10px] tracking-wide uppercase opacity-50">Ver todo en</p>
            <SelectorMoneda />
          </div>
        </div>
      </header>

      <main className="px-4 pt-4 pb-28">
        <Outlet />
      </main>

      <nav
        data-noprint
        className="safe-bottom fixed inset-x-0 bottom-0 border-t border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
        <div className="mx-auto flex max-w-3xl items-center justify-around gap-0.5 px-1 py-1.5">
          {SECCIONES.map((seccion) => (
            <NavLink
              key={seccion.a}
              to={seccion.a}
              end={seccion.a === '/'}
              className={({ isActive }) =>
                [
                  // Seis pestañas tienen que caber en un teléfono de 360 px de
                  // ancho sin apretarse ni desbordarse.
                  'flex min-h-[52px] min-w-[50px] flex-1 flex-col items-center justify-center gap-0.5 rounded-lg px-1 text-[10px]',
                  seccion.destacado
                    ? 'bg-brand-600 font-bold text-white'
                    : isActive
                      ? 'text-brand-600 font-semibold dark:text-brand-500'
                      : 'opacity-60',
                ].join(' ')
              }
            >
              <span aria-hidden className={seccion.destacado ? 'text-lg' : 'text-base'}>
                {seccion.icono}
              </span>
              {seccion.texto}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
