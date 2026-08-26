import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from '../features/auth/AuthContext';
import { LoginPage } from '../features/auth/LoginPage';
import { MonedaProvider } from '../features/moneda/MonedaContext';
import { Layout } from './Layout';
import { Inicio } from '../features/inicio/Inicio';
import { Vender } from '../features/vender/Vender';
import { VentasTotales } from '../features/ventas/VentasTotales';
import { Ventas } from '../features/ventas/Ventas';
import { DetalleVenta } from '../features/ventas/DetalleVenta';
import { Todo } from '../features/todo/Todo';
import { Clientes } from '../features/clientes/Clientes';
import { Cuenta } from '../features/clientes/Cuenta';
import { Deudas } from '../features/clientes/Deudas';
import { Inventario } from '../features/inventario/Inventario';
import { Mas } from '../features/mas/Mas';
import { Tasas } from '../features/mas/Tasas';
import { Gastos } from '../features/mas/Gastos';
import { Comprar } from '../features/mas/Comprar';
import { Cajas } from '../features/cajas/Cajas';
import { Dias } from '../features/dias/Dias';

export function App() {
  const { user, cargando } = useAuth();

  // Mientras se recupera la sesión guardada no se enseña el login: parpadearía
  // en cada recarga.
  if (cargando) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <div className="h-8 w-8 animate-pulse rounded-full bg-slate-300 dark:bg-slate-700" />
      </div>
    );
  }

  if (!user) return <LoginPage />;

  return (
    <MonedaProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Inicio />} />
            <Route path="vender" element={<Vender />} />
            <Route path="ventas-totales" element={<VentasTotales />} />
            <Route path="ventas" element={<Ventas />} />
            <Route path="ventas/:id" element={<DetalleVenta />} />
            <Route path="todo" element={<Todo />} />
            <Route path="clientes" element={<Clientes />} />
            <Route path="clientes/deudas" element={<Deudas tipo="CLIENTE" />} />
            <Route path="proveedores/deudas" element={<Deudas tipo="PROVEEDOR" />} />
            <Route path="clientes/:id" element={<Cuenta />} />
            <Route path="proveedores/:id" element={<Cuenta />} />
            <Route path="inventario" element={<Inventario />} />
            <Route path="mas" element={<Mas />} />
            <Route path="mas/tasas" element={<Tasas />} />
            <Route path="mas/gastos" element={<Gastos />} />
            <Route path="mas/comprar" element={<Comprar />} />
            <Route path="mas/cajas" element={<Cajas />} />
            <Route path="mas/dias" element={<Dias />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </MonedaProvider>
  );
}
