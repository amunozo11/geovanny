import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { D, MONEDAS, formatMoney, money } from '@geovanny/shared';
import type { ApiError } from '../../lib/api';
import { api } from '../../lib/api';
import { Aviso, Boton, Campo, Cargando, Tarjeta, Vacio } from '../../components/ui/base';
import { useAuth } from '../auth/AuthContext';
import type { Persona } from '../../lib/tipos';

/**
 * Los proveedores: quién es y cuánto le debes.
 *
 * Misma idea que la pantalla de clientes, vista al revés. Para un proveedor un
 * saldo positivo es plata que **tú** debes, no que te deben — el signo se lee
 * igual, lo que cambia es de qué lado está la deuda.
 *
 * Hasta ahora un proveedor solo nacía al registrar un viaje. Eso obligaba a
 * inventarse una compra para poder anotar una deuda que ya existía, así que
 * aquí se crean directamente.
 */
export function Proveedores() {
  const { puede } = useAuth();
  const [texto, setTexto] = useState('');
  const [creando, setCreando] = useState(false);

  const consulta = useQuery({
    queryKey: ['personas', 'PROVEEDOR', texto],
    queryFn: () =>
      api<Persona[]>(`/personas?tipo=PROVEEDOR&q=${encodeURIComponent(texto)}`),
  });

  const proveedores = consulta.data ?? [];
  const conDeuda = proveedores.filter((p) =>
    MONEDAS.some((m) => D(p.saldos?.[m] ?? '0').greaterThan(0)),
  );
  const alDia = proveedores.filter((p) => !conDeuda.includes(p));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold">Proveedores</h1>
        {conDeuda.length > 0 && (
          <Link to="/proveedores/deudas" className="shrink-0 text-sm underline opacity-70">
            Reporte general
          </Link>
        )}
      </div>

      <Campo valor={texto} onChange={setTexto} placeholder="Buscar proveedor…" />

      {consulta.isLoading && <Cargando />}

      {!consulta.isLoading && proveedores.length === 0 && !creando && (
        <Vacio
          mensaje="No hay proveedores todavía."
          accion={
            puede('supplier:write') ? (
              <Boton onClick={() => setCreando(true)}>Crear el primero</Boton>
            ) : undefined
          }
        />
      )}

      {conDeuda.length > 0 && (
        <Tarjeta titulo={`Le debes a (${conDeuda.length})`}>
          <Lista personas={conDeuda} />
        </Tarjeta>
      )}

      {alDia.length > 0 && (
        <Tarjeta titulo={`Al día (${alDia.length})`}>
          <Lista personas={alDia} />
        </Tarjeta>
      )}

      {creando ? (
        <FormularioProveedor
          onListo={() => setCreando(false)}
          onCancelar={() => setCreando(false)}
        />
      ) : (
        puede('supplier:write') &&
        proveedores.length > 0 && (
          <Boton variante="secundario" onClick={() => setCreando(true)} className="w-full">
            Agregar proveedor
          </Boton>
        )
      )}
    </div>
  );
}

function Lista({ personas }: { personas: Persona[] }) {
  return (
    <ul className="divide-y divide-slate-100 dark:divide-slate-800">
      {personas.map((persona) => {
        const saldos = MONEDAS.filter((m) => Number(persona.saldos?.[m] ?? '0') !== 0);

        return (
          <li key={persona.id}>
            <Link
              to={`/proveedores/${persona.id}`}
              className="flex items-center justify-between gap-3 py-3"
            >
              <span className="min-w-0">
                <span className="block truncate font-medium">{persona.nombre}</span>
                {persona.telefono && (
                  <span className="text-xs opacity-50">{persona.telefono}</span>
                )}
              </span>
              <span className="tabular shrink-0 text-right text-sm">
                {saldos.length === 0 ? (
                  <span className="text-emerald-600 dark:text-emerald-400">al día</span>
                ) : (
                  saldos.map((m) => (
                    <span key={m} className="block font-semibold">
                      {formatMoney(money(persona.saldos[m]!, m))}
                    </span>
                  ))
                )}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Alta de un proveedor. Solo el nombre es obligatorio: igual que con los
 * clientes, pedir más datos frena el trabajo y nadie los tiene a mano (CN-3).
 * El saldo que se le deba se carga después desde su cuenta.
 */
function FormularioProveedor({
  onListo,
  onCancelar,
}: {
  onListo: () => void;
  onCancelar: () => void;
}) {
  const clienteDeQuery = useQueryClient();
  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('');
  const [error, setError] = useState<string | null>(null);

  const crear = useMutation({
    mutationFn: () =>
      api<Persona>('/personas', {
        method: 'POST',
        body: JSON.stringify({
          nombre: nombre.trim().toUpperCase(),
          tipo: 'PROVEEDOR',
          telefono: telefono.trim() || null,
        }),
      }),
    onSuccess: () => {
      void clienteDeQuery.invalidateQueries({ queryKey: ['personas'] });
      onListo();
    },
    onError: (e: ApiError) => setError(e.message),
  });

  return (
    <Tarjeta titulo="Nuevo proveedor">
      <div className="space-y-3">
        <Campo etiqueta="Nombre" valor={nombre} onChange={setNombre} autoFocus />
        <Campo etiqueta="Teléfono (opcional)" valor={telefono} onChange={setTelefono} />

        <p className="text-xs opacity-60">
          Lo que le debas se anota después, desde su cuenta, con su fecha y su moneda.
        </p>

        {error && <Aviso tono="error">{error}</Aviso>}

        <div className="flex gap-2">
          <Boton variante="secundario" onClick={onCancelar} className="flex-1">
            Cancelar
          </Boton>
          <Boton
            onClick={() => crear.mutate()}
            disabled={!nombre.trim() || crear.isPending}
            className="flex-1"
          >
            {crear.isPending ? 'Creando…' : 'Crear'}
          </Boton>
        </div>
      </div>
    </Tarjeta>
  );
}
