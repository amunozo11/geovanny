import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { D, MONEDAS, cantidadTexto, formatMoney, money, type Moneda } from '@geovanny/shared';
import type { ApiError } from '../../lib/api';
import { api } from '../../lib/api';
import { useMoneda } from '../moneda/contexto';
import { SelectorCaja } from '../cajas/SelectorCaja';
import { Aviso, Boton, Campo, Cargando, Seleccion, Tarjeta, Vacio } from '../../components/ui/base';
import { CampoDinero } from '../../components/ui/CampoDinero';
import { CampoCantidad } from '../../components/ui/CampoCantidad';
import { CampoFecha, comoInstante } from '../../components/ui/CampoFecha';
import { useAuth } from '../auth/AuthContext';
import type { Cargo, Operacion, Pago, Persona } from '../../lib/tipos';

/** Qué se puede hacer con un movimiento ya registrado. */
type Accion = 'editar' | 'eliminar';

interface Cuenta {
  persona: Persona;
  operaciones: Operacion[];
  pagos: Pago[];
  cargos: Cargo[];
}

/**
 * Estado de cuenta de una persona: lo que debe, qué compró y qué ha abonado.
 *
 * Reemplaza la matriz cliente × fecha de su Excel, con la diferencia de que
 * aquí cada movimiento se puede abrir y ver qué productos había detrás — algo
 * que hoy es imposible, porque el monto y los bultos viven en hojas distintas.
 */
export function Cuenta() {
  const { id } = useParams<{ id: string }>();
  const clienteDeQuery = useQueryClient();
  const { puede } = useAuth();
  const [abriendoAbono, setAbriendoAbono] = useState(false);
  const [abriendoCargo, setAbriendoCargo] = useState(false);
  /** Corregir o quitar un movimiento concreto. Solo uno abierto a la vez. */
  const [abierto, setAbierto] = useState<{ id: string; accion: Accion } | null>(null);

  const consulta = useQuery({
    queryKey: ['cuenta', id],
    queryFn: () => api<Cuenta>(`/personas/${id}/cuenta`),
  });

  if (consulta.isLoading) return <Cargando />;
  if (consulta.isError || !consulta.data) {
    return <Aviso tono="error">No se pudo cargar la cuenta.</Aviso>;
  }

  const { persona, operaciones, pagos, cargos = [] } = consulta.data;
  const conSaldo = MONEDAS.filter((m) => Number(persona.saldos?.[m] ?? '0') !== 0);
  const debeAlgo = conSaldo.some((m) => D(persona.saldos[m]!).greaterThan(0));

  const movimientos = [
    ...operaciones.map((o) => ({ tipo: 'operacion' as const, fecha: o.fecha, dato: o })),
    ...pagos.map((p) => ({ tipo: 'pago' as const, fecha: p.fecha, dato: p })),
    ...cargos.map((c) => ({ tipo: 'cargo' as const, fecha: c.fecha, dato: c })),
  ].sort((a, b) => b.fecha.localeCompare(a.fecha));

  const refrescar = () => {
    setAbierto(null);
    void clienteDeQuery.invalidateQueries();
  };

  const acciones = (movimientoId: string) => ({
    panel: abierto?.id === movimientoId ? abierto.accion : null,
    onAbrir: (accion: Accion) =>
      setAbierto((previo) =>
        previo?.id === movimientoId && previo.accion === accion
          ? null
          : { id: movimientoId, accion },
      ),
    onCerrar: () => setAbierto(null),
    onListo: refrescar,
  });

  return (
    <div className="space-y-4">
      <div>
        <Link to="/clientes" className="text-sm opacity-60">
          ← Clientes
        </Link>
        <h1 className="text-xl font-bold">{persona.nombre}</h1>
        {persona.telefono && <p className="text-sm opacity-60">{persona.telefono}</p>}
      </div>

      <Tarjeta destacada titulo="Saldo">
        {conSaldo.length === 0 ? (
          <p className="text-lg font-semibold">Está al día</p>
        ) : (
          <div className="space-y-1">
            {conSaldo.map((m) => {
              const saldo = D(persona.saldos[m]!);
              return (
                <p key={m} className="tabular text-2xl font-semibold">
                  {formatMoney(money(saldo.toString(), m))}
                  {saldo.isNegative() && (
                    <span className="ml-2 text-sm font-normal opacity-70">a favor</span>
                  )}
                </p>
              );
            })}
          </div>
        )}
        <p className="mt-2 text-xs opacity-60">
          Cada moneda es una cuenta aparte, como en tu cuaderno.
        </p>
      </Tarjeta>

      {!abriendoAbono && !abriendoCargo && (
        <div className="flex gap-2">
          {debeAlgo && (
            <Boton onClick={() => setAbriendoAbono(true)} className="flex-1">
              Registrar abono
            </Boton>
          )}
          {puede('charge:create') && (
            <Boton
              variante="secundario"
              onClick={() => setAbriendoCargo(true)}
              className="flex-1"
            >
              Prestar o cargar deuda
            </Boton>
          )}
        </div>
      )}

      {abriendoAbono && (
        <FormularioAbono
          persona={persona}
          onListo={() => {
            setAbriendoAbono(false);
            void clienteDeQuery.invalidateQueries();
          }}
          onCancelar={() => setAbriendoAbono(false)}
        />
      )}

      {abriendoCargo && (
        <FormularioCargo
          persona={persona}
          onListo={() => {
            setAbriendoCargo(false);
            void clienteDeQuery.invalidateQueries();
          }}
          onCancelar={() => setAbriendoCargo(false)}
        />
      )}

      <Tarjeta titulo="Movimientos">
        {movimientos.length === 0 ? (
          <Vacio mensaje="Todavía no hay movimientos." />
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {movimientos.map((movimiento) =>
              movimiento.tipo === 'operacion' ? (
                <FilaOperacion
                  key={movimiento.dato.id}
                  operacion={movimiento.dato}
                  persona={persona}
                  puedeTocar={puede('sale:void')}
                  {...acciones(movimiento.dato.id)}
                />
              ) : movimiento.tipo === 'pago' ? (
                <FilaPago
                  key={movimiento.dato.id}
                  pago={movimiento.dato}
                  persona={persona}
                  puedeTocar={puede('payment:void')}
                  {...acciones(movimiento.dato.id)}
                />
              ) : (
                <FilaCargo
                  key={movimiento.dato.id}
                  cargo={movimiento.dato}
                  persona={persona}
                  puedeTocar={puede('charge:void')}
                  {...acciones(movimiento.dato.id)}
                />
              ),
            )}
          </ul>
        )}
      </Tarjeta>
    </div>
  );
}

/** Muestra el equivalente en la moneda elegida, solo si aporta algo. */
function EquivalenteSiEsOtra({ importe }: { importe: Operacion['total'] }) {
  const { moneda } = useMoneda();
  if (importe.moneda === moneda) return null;
  return (
    <p className="tabular text-xs opacity-50">
      ≈ {formatMoney(money(importe.eq[moneda], moneda))}
    </p>
  );
}

function FilaOperacion({
  operacion,
  persona,
  puedeTocar,
  panel,
  onAbrir,
  onCerrar,
  onListo,
}: {
  operacion: Operacion;
  persona: Persona;
  puedeTocar: boolean;
  panel: Accion | null;
  onAbrir: (accion: Accion) => void;
  onCerrar: () => void;
  onListo: () => void;
}) {
  const pendiente = D(operacion.saldo).greaterThan(0);
  // Con abonos encima no se toca: deshacerla dejaría esos abonos apuntando a
  // una venta que ya no existe (RP-06).
  const conAbonos = D(operacion.pagado).greaterThan(D(operacion.pagadoInicial ?? '0'));

  return (
    <li className="py-3">
      <div className="flex items-start justify-between gap-3">
        <Link to={`/ventas/${operacion.id}`} className="min-w-0">
          <p className="text-sm font-medium underline decoration-transparent hover:decoration-inherit">
            {operacion.numero} · {new Date(operacion.fecha).toLocaleDateString('es-CO')}
          </p>
          <p className="truncate text-xs opacity-60">
            {operacion.items
              .map((i) => `${cantidadTexto(i.cantidad)} ${i.nombre.toLowerCase()}`)
              .join(' · ')}
          </p>
          <p className="text-xs opacity-40">ver el detalle</p>
        </Link>
        {/* En esta pantalla manda la moneda de la deuda, no la de visualización:
            mezclar "total en bolívares" con "debe en pesos" en la misma línea
            confunde, y aquí lo que importa es en qué se tiene que pagar. La
            equivalencia se muestra debajo, en pequeño. */}
        <div className="shrink-0 text-right">
          <p className="tabular">
            {formatMoney(money(operacion.total.monto, operacion.moneda))}
          </p>
          {pendiente ? (
            <p className="tabular text-xs text-amber-600 dark:text-amber-400">
              debe {formatMoney(money(operacion.saldo, operacion.moneda))}
            </p>
          ) : (
            <p className="text-xs text-emerald-600 dark:text-emerald-400">pagado</p>
          )}
          <EquivalenteSiEsOtra importe={operacion.total} />
        </div>
      </div>

      {puedeTocar && <Acciones panel={panel} onAbrir={onAbrir} />}

      {panel !== null &&
        (conAbonos ? (
          <div className="mt-3 space-y-3 border-t border-slate-200 pt-3 dark:border-slate-800">
            <Aviso tono="atencion">
              Esta venta ya recibió abonos. Quítalos primero: si se deshiciera ahora, esos abonos
              quedarían apuntando a una venta que no existe.
            </Aviso>
            <Boton variante="secundario" onClick={onCerrar} className="w-full">
              Entendido
            </Boton>
          </div>
        ) : panel === 'editar' ? (
          <FormularioVenta operacion={operacion} onListo={onListo} onCancelar={onCerrar} />
        ) : (
          <ConfirmarAnular
            ruta={`/operaciones/${operacion.id}`}
            que={`la venta ${operacion.numero}`}
            consecuencia={`La mercancía vuelve al inventario y la deuda de ${persona.nombre} baja ${formatMoney(money(operacion.saldo, operacion.moneda))}.`}
            onListo={onListo}
            onCancelar={onCerrar}
          />
        ))}
    </li>
  );
}

/**
 * Corregir una venta ya registrada.
 *
 * Se arreglan las cantidades y los precios de lo que se despachó, se quita una
 * línea, se cambia la moneda o el día. Añadir un producto que no estaba, no:
 * eso ya no es corregir una anotación, es otra venta, y para eso está eliminar
 * y volver a registrarla.
 *
 * Al guardar, la venta se deshace entera y se rehace —inventario, caja y deuda
 * incluidos— conservando la tasa de su día, para que el cierre de aquel día no
 * se mueva por arreglar una cantidad.
 */
function FormularioVenta({
  operacion,
  onListo,
  onCancelar,
}: {
  operacion: Operacion;
  onListo: () => void;
  onCancelar: () => void;
}) {
  const [lineas, setLineas] = useState(
    operacion.items.map((item, indice) => ({ clave: indice, ...item })),
  );
  const [moneda, setMoneda] = useState<Moneda>(operacion.moneda);
  const [dia, setDia] = useState(operacion.fecha.slice(0, 10));
  const [error, setError] = useState<string | null>(null);
  const [forzar, setForzar] = useState(false);

  const total = lineas.reduce(
    (acc, l) => acc.plus(D(l.cantidad || '0').times(D(l.precio || '0'))),
    D(0),
  );

  const cambiar = (clave: number, cambios: { cantidad?: string; precio?: string }) =>
    setLineas((previas) =>
      previas.map((l) => (l.clave === clave ? { ...l, ...cambios } : l)),
    );

  const guardar = useMutation({
    mutationFn: () =>
      api(`/operaciones/${operacion.id}` + (forzar ? '?forzar=true' : ''), {
        method: 'PATCH',
        body: JSON.stringify({
          items: lineas.map((l) => ({
            productoId: l.productoId,
            cantidad: l.cantidad,
            precio: l.precio,
          })),
          moneda,
          fecha: comoInstante(dia),
        }),
      }),
    onSuccess: onListo,
    onError: (e: ApiError) => {
      setError(e.message);
      if (e.code === 'SIN_STOCK') setForzar(true);
    },
  });

  const completas = lineas.every(
    (l) => D(l.cantidad || '0').greaterThan(0) && D(l.precio || '0').greaterThan(0),
  );

  return (
    <div className="mt-3 space-y-3 border-t border-slate-200 pt-3 dark:border-slate-800">
      <Aviso tono="info">
        La venta {operacion.numero} se anula y nace una nueva con lo corregido. El inventario y la
        caja se rehacen solos, y se conserva la tasa de su día.
      </Aviso>

      <ul className="space-y-3">
        {lineas.map((linea) => (
          <li key={linea.clave} className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="min-w-0 truncate text-sm font-semibold">{linea.nombre}</p>
              {lineas.length > 1 && (
                <button
                  type="button"
                  aria-label={`Quitar ${linea.nombre}`}
                  onClick={() => setLineas((p) => p.filter((l) => l.clave !== linea.clave))}
                  className="shrink-0 px-2 text-lg opacity-40"
                >
                  ✕
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <CampoCantidad
                etiqueta="Cantidad"
                valor={linea.cantidad}
                onChange={(v) => cambiar(linea.clave, { cantidad: v })}
                unidad={linea.unidad}
              />
              <CampoDinero
                etiqueta={`Precio por ${linea.unidad.toLowerCase()}`}
                valor={linea.precio}
                onChange={(v) => cambiar(linea.clave, { precio: v })}
                moneda={moneda}
              />
            </div>
          </li>
        ))}
      </ul>

      <Seleccion
        etiqueta="Moneda de la venta"
        valor={moneda}
        onChange={setMoneda}
        opciones={MONEDAS.map((m) => ({ valor: m, texto: m }))}
      />

      <CampoFecha valor={dia} onChange={setDia} etiqueta="¿Qué día fue la venta?" />

      <p className="tabular text-sm">
        <span className="opacity-60">Queda en </span>
        <strong>{formatMoney(money(total.toString(), moneda))}</strong>
        <span className="opacity-60">
          {' '}
          (antes {formatMoney(money(operacion.total.monto, operacion.moneda))})
        </span>
      </p>

      <p className="text-xs opacity-50">
        Para añadir un producto que no estaba, elimina la venta y regístrala de nuevo.
      </p>

      {error && <Aviso tono="error">{error}</Aviso>}

      <div className="flex gap-2">
        <Boton variante="secundario" onClick={onCancelar} className="flex-1">
          Cancelar
        </Boton>
        <Boton
          onClick={() => guardar.mutate()}
          disabled={!completas || guardar.isPending}
          variante={forzar ? 'peligro' : 'primario'}
          className="flex-1"
        >
          {guardar.isPending
            ? 'Guardando…'
            : forzar
              ? 'Corregir igual (sin existencias)'
              : 'Guardar corrección'}
        </Boton>
      </div>
    </div>
  );
}

function FilaPago({
  pago,
  persona,
  puedeTocar,
  panel,
  onAbrir,
  onCerrar,
  onListo,
}: {
  pago: Pago;
  persona: Persona;
  puedeTocar: boolean;
  panel: Accion | null;
  onAbrir: (accion: Accion) => void;
  onCerrar: () => void;
  onListo: () => void;
}) {
  const enOtraMoneda = pago.importe.moneda !== pago.aplicaA;

  return (
    <li className="py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
            Abono {pago.numero} · {new Date(pago.fecha).toLocaleDateString('es-CO')}
          </p>
          <p className="text-xs opacity-60">
            {pago.metodo.toLowerCase()}
            {enOtraMoneda && (
              <>
                {' · '}
                pagó en {pago.importe.moneda}, se aplicó a la deuda en {pago.aplicaA} a{' '}
                {pago.importe.tasa.usdVes} Bs/US$
              </>
            )}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="tabular text-sm">
            − {formatMoney(money(pago.montoAplicado, pago.aplicaA))}
          </p>
          {enOtraMoneda && (
            <p className="tabular text-xs opacity-50">
              recibido {formatMoney(money(pago.importe.monto, pago.importe.moneda))}
            </p>
          )}
        </div>
      </div>

      {puedeTocar && <Acciones panel={panel} onAbrir={onAbrir} />}

      {panel === 'editar' && (
        <FormularioAbono
          persona={persona}
          pago={pago}
          onListo={onListo}
          onCancelar={onCerrar}
        />
      )}
      {panel === 'eliminar' && (
        <ConfirmarAnular
          ruta={`/pagos/${pago.id}`}
          que={`el abono ${pago.numero}`}
          consecuencia={`La deuda de ${persona.nombre} vuelve a subir ${formatMoney(money(pago.montoAplicado, pago.aplicaA))} y la plata sale de la caja.`}
          onListo={onListo}
          onCancelar={onCerrar}
        />
      )}
    </li>
  );
}

/**
 * Corregir o quitar. Dos enlaces discretos: se usan poco, pero cuando se
 * necesitan no puede haber que salir a otra pantalla a buscarlos.
 */
function Acciones({ panel, onAbrir }: { panel: Accion | null; onAbrir: (a: Accion) => void }) {
  return (
    <div className="mt-2 flex justify-end gap-3 text-xs">
      <button
        type="button"
        onClick={() => onAbrir('editar')}
        className={panel === 'editar' ? 'font-semibold underline' : 'underline opacity-60'}
      >
        Corregir
      </button>
      <button
        type="button"
        onClick={() => onAbrir('eliminar')}
        className="text-rose-600 underline opacity-80 dark:text-rose-400"
      >
        Eliminar
      </button>
    </div>
  );
}

/**
 * Quitar un movimiento.
 *
 * No se borra: se anula, y se deshace exactamente lo que hizo. Borrarlo de
 * verdad dejaría un saldo sin explicación, que es el problema que este sistema
 * viene a resolver. Por eso se pide el motivo y se dice antes qué va a pasar.
 */
function ConfirmarAnular({
  ruta,
  que,
  consecuencia,
  onListo,
  onCancelar,
}: {
  ruta: string;
  que: string;
  consecuencia: string;
  onListo: () => void;
  onCancelar: () => void;
}) {
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState<string | null>(null);

  const anular = useMutation({
    mutationFn: () =>
      api(`${ruta}/anular`, {
        method: 'POST',
        body: JSON.stringify({ motivo: motivo.trim() || 'Registro equivocado' }),
      }),
    onSuccess: onListo,
    onError: (e: ApiError) => setError(e.message),
  });

  return (
    <div className="mt-3 space-y-3 border-t border-slate-200 pt-3 dark:border-slate-800">
      <Aviso tono="atencion">
        <p>¿Quitar {que}?</p>
        <p className="mt-1 text-xs opacity-80">{consecuencia}</p>
        <p className="mt-1 text-xs opacity-80">
          No se borra del historial: queda marcado como anulado, con el motivo.
        </p>
      </Aviso>

      <Campo
        etiqueta="Motivo"
        valor={motivo}
        onChange={setMotivo}
        placeholder="Registro equivocado"
      />

      {error && <Aviso tono="error">{error}</Aviso>}

      <div className="flex gap-2">
        <Boton variante="secundario" onClick={onCancelar} className="flex-1">
          No, dejarlo
        </Boton>
        <Boton
          variante="peligro"
          onClick={() => anular.mutate()}
          disabled={anular.isPending}
          className="flex-1"
        >
          {anular.isPending ? 'Quitando…' : 'Sí, quitar'}
        </Boton>
      </div>
    </div>
  );
}

/**
 * Abono, incluido el caso difícil: la deuda está en dólares y paga en bolívares.
 * La pantalla muestra en todo momento cuánto se descuenta de la deuda y con qué
 * tasa, para que no haya sorpresas al cuadrar (§8, §21).
 */
function FormularioAbono({
  persona,
  pago,
  onListo,
  onCancelar,
}: {
  persona: Persona;
  /** Si viene, se está corrigiendo ese abono en vez de crear uno nuevo. */
  pago?: Pago;
  onListo: () => void;
  onCancelar: () => void;
}) {
  const corrigiendo = Boolean(pago);

  // Al corregir hay que poder elegir la deuda a la que ya se aplicó, aunque su
  // saldo esté hoy en cero: fue este mismo abono el que la bajó.
  const conSaldo = MONEDAS.filter((m) => D(persona.saldos?.[m] ?? '0').greaterThan(0));
  const deudas = pago && !conSaldo.includes(pago.aplicaA) ? [pago.aplicaA, ...conSaldo] : conSaldo;

  const [aplicaA, setAplicaA] = useState<Moneda>(pago?.aplicaA ?? deudas[0] ?? 'VES');
  const [moneda, setMoneda] = useState<Moneda>(
    pago?.importe.moneda ?? pago?.aplicaA ?? deudas[0] ?? 'VES',
  );
  const [monto, setMonto] = useState(pago?.importe.monto ?? '');
  const [cajaId, setCajaId] = useState('');
  const [error, setError] = useState<string | null>(null);

  const registrar = useMutation({
    mutationFn: () =>
      api(corrigiendo ? `/pagos/${pago!.id}` : '/pagos', {
        method: corrigiendo ? 'PATCH' : 'POST',
        body: JSON.stringify({
          personaId: persona.id,
          direccion: persona.tipo === 'CLIENTE' ? 'ENTRA' : 'SALE',
          monto,
          moneda,
          aplicaA,
          cajaId: cajaId || null,
        }),
      }),
    onSuccess: onListo,
    onError: (e: ApiError) => setError(e.message),
  });

  const saldo = persona.saldos?.[aplicaA] ?? '0';
  const distintaMoneda = moneda !== aplicaA;

  const cuerpo = (
      <div className="space-y-3">
        {corrigiendo && (
          <Aviso tono="info">
            Al cambiar el monto o la moneda, el abono {pago!.numero} se anula y nace uno nuevo con
            los datos corregidos. Así la deuda y la caja se deshacen bien; los dos quedan en el
            historial.
          </Aviso>
        )}
        <Seleccion
          etiqueta="¿A qué deuda?"
          valor={aplicaA}
          onChange={(valor) => {
            setAplicaA(valor);
            setMoneda(valor);
          }}
          opciones={deudas.map((m) => ({
            valor: m,
            texto: `Deuda en ${m} — ${formatMoney(money(persona.saldos[m]!, m))}`,
          }))}
        />

        <div className="grid grid-cols-2 gap-3">
          <CampoDinero
            etiqueta="¿Cuánto abona?"
            valor={monto}
            onChange={setMonto}
            moneda={moneda}
            autoFocus
          />
          <Seleccion
            etiqueta="¿En qué paga?"
            valor={moneda}
            onChange={setMoneda}
            opciones={MONEDAS.map((m) => ({ valor: m, texto: m }))}
          />
        </div>

        {distintaMoneda && (
          <Aviso tono="info">
            Paga en {moneda} una deuda en {aplicaA}. Se convertirá con la tasa de hoy y quedará
            anotado exactamente cuánto recibiste y cuánto se descontó.
          </Aviso>
        )}

        <SelectorCaja moneda={moneda} valor={cajaId} onChange={setCajaId} />

        <p className="text-xs opacity-60">
          Debe {formatMoney(money(saldo, aplicaA))}. Si abona de más, el sobrante le queda a favor.
        </p>

        {error && <Aviso tono="error">{error}</Aviso>}

        <div className="flex gap-2">
          <Boton variante="secundario" onClick={onCancelar} className="flex-1">
            Cancelar
          </Boton>
          <Boton
            onClick={() => registrar.mutate()}
            disabled={!monto || registrar.isPending}
            className="flex-1"
          >
            {registrar.isPending ? 'Guardando…' : corrigiendo ? 'Guardar corrección' : 'Guardar abono'}
          </Boton>
        </div>
      </div>
  );

  // Corrigiendo va dentro de la fila, sin tarjeta encima de tarjeta.
  return corrigiendo ? (
    <div className="mt-3 border-t border-slate-200 pt-3 dark:border-slate-800">{cuerpo}</div>
  ) : (
    <Tarjeta titulo="Registrar abono">{cuerpo}</Tarjeta>
  );
}

const ETIQUETA_CARGO: Record<Cargo['tipo'], string> = {
  PRESTAMO: 'Préstamo',
  DEUDA: 'Deuda',
  AJUSTE: 'Ajuste',
};

function FilaCargo({
  cargo,
  persona,
  puedeTocar,
  panel,
  onAbrir,
  onCerrar,
  onListo,
}: {
  cargo: Cargo;
  persona: Persona;
  puedeTocar: boolean;
  panel: Accion | null;
  onAbrir: (accion: Accion) => void;
  onCerrar: () => void;
  onListo: () => void;
}) {
  const pendiente = D(cargo.saldo).greaterThan(0);
  const conAbonos = !D(cargo.saldo).equals(D(cargo.importe.monto));

  return (
    <li className="py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
            {ETIQUETA_CARGO[cargo.tipo]} {cargo.numero} ·{' '}
            {new Date(cargo.fecha).toLocaleDateString('es-CO')}
          </p>
          <p className="truncate text-xs opacity-60">
            {cargo.concepto}
            {cargo.salioDeCaja && ' · salió de la caja'}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="tabular">{formatMoney(money(cargo.importe.monto, cargo.moneda))}</p>
          {pendiente ? (
            <p className="tabular text-xs text-amber-600 dark:text-amber-400">
              debe {formatMoney(money(cargo.saldo, cargo.moneda))}
            </p>
          ) : (
            <p className="text-xs text-emerald-600 dark:text-emerald-400">pagado</p>
          )}
        </div>
      </div>

      {puedeTocar && <Acciones panel={panel} onAbrir={onAbrir} />}

      {panel === 'editar' && (
        <FormularioCargo
          persona={persona}
          cargo={cargo}
          onListo={onListo}
          onCancelar={onCerrar}
        />
      )}
      {panel === 'eliminar' &&
        (conAbonos ? (
          <div className="mt-3 space-y-3 border-t border-slate-200 pt-3 dark:border-slate-800">
            <Aviso tono="atencion">
              Este cargo ya recibió abonos. Quítalos primero: si se borrara ahora, esos abonos
              quedarían apuntando a una deuda que no existe.
            </Aviso>
            <Boton variante="secundario" onClick={onCerrar} className="w-full">
              Entendido
            </Boton>
          </div>
        ) : (
          <ConfirmarAnular
            ruta={`/cargos/${cargo.id}`}
            que={`${ETIQUETA_CARGO[cargo.tipo].toLowerCase()} ${cargo.numero}`}
            consecuencia={`La deuda de ${persona.nombre} baja ${formatMoney(money(cargo.importe.monto, cargo.moneda))}${cargo.salioDeCaja ? ' y la plata vuelve a la caja.' : '.'}`}
            onListo={onListo}
            onCancelar={onCerrar}
          />
        ))}
    </li>
  );
}

/**
 * Cargar una deuda que no viene de una venta.
 *
 * La pregunta que de verdad importa es si salió plata del cajón: prestarle
 * 100 dólares a alguien vacía la caja, mientras que anotar una deuda vieja que
 * ya existía no mueve nada. Se pregunta explícitamente porque el sistema no
 * puede adivinarlo, y equivocarse descuadra el cierre del día.
 */
function FormularioCargo({
  persona,
  cargo,
  onListo,
  onCancelar,
}: {
  persona: Persona;
  /** Si viene, se está corrigiendo ese cargo en vez de crear uno nuevo. */
  cargo?: Cargo;
  onListo: () => void;
  onCancelar: () => void;
}) {
  const corrigiendo = Boolean(cargo);

  const [tipo, setTipo] = useState<Cargo['tipo']>(cargo?.tipo ?? 'PRESTAMO');
  const [concepto, setConcepto] = useState(cargo?.concepto ?? '');
  const [monto, setMonto] = useState(cargo?.importe.monto ?? '');
  const [moneda, setMoneda] = useState<Moneda>(cargo?.moneda ?? 'VES');
  const [cajaId, setCajaId] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Prestar entrega dinero; anotar una deuda vieja o corregir un saldo, no.
  const salioDeCaja = tipo === 'PRESTAMO';

  const registrar = useMutation({
    mutationFn: () =>
      api(corrigiendo ? `/cargos/${cargo!.id}` : '/cargos', {
        method: corrigiendo ? 'PATCH' : 'POST',
        body: JSON.stringify({
          personaId: persona.id,
          tipo,
          concepto,
          monto,
          moneda,
          salioDeCaja,
          cajaId: salioDeCaja ? cajaId || null : null,
        }),
      }),
    onSuccess: onListo,
    onError: (e: ApiError) => setError(e.message),
  });

  const cuerpo = (
      <div className="space-y-3">
        {corrigiendo && (
          <Aviso tono="info">
            El concepto se arregla aquí mismo. Si cambias el monto o la moneda, el cargo{' '}
            {cargo!.numero} se anula y nace uno nuevo, para que el saldo y la caja se deshagan
            bien.
          </Aviso>
        )}
        <Seleccion
          etiqueta="¿Qué es?"
          valor={tipo}
          onChange={setTipo}
          opciones={[
            { valor: 'PRESTAMO', texto: 'Préstamo — le entregas plata ahora' },
            { valor: 'DEUDA', texto: 'Deuda pendiente — ya la debía, solo la anotas' },
            { valor: 'AJUSTE', texto: 'Ajuste — corregir un saldo mal registrado' },
          ]}
        />

        <Campo
          etiqueta="¿Por qué te queda debiendo?"
          valor={concepto}
          onChange={setConcepto}
          placeholder={tipo === 'PRESTAMO' ? 'Préstamo para el flete' : 'Deuda del cuaderno viejo'}
          autoFocus
        />

        <div className="grid grid-cols-2 gap-3">
          <CampoDinero etiqueta="Cuánto" valor={monto} onChange={setMonto} moneda={moneda} />
          <Seleccion
            etiqueta="Moneda"
            valor={moneda}
            onChange={setMoneda}
            opciones={MONEDAS.map((m) => ({ valor: m, texto: m }))}
          />
        </div>

        {salioDeCaja ? (
          <>
            <SelectorCaja moneda={moneda} valor={cajaId} onChange={setCajaId} etiqueta="¿De dónde sale la plata?" />
            <Aviso tono="atencion">
              Esta plata sale de la caja hoy y aparecerá en el cierre del día como préstamo
              entregado.
            </Aviso>
          </>
        ) : (
          <Aviso tono="info">
            No mueve dinero: solo sube lo que {persona.nombre} te debe. Úsalo para pasar al sistema
            una deuda que ya existía.
          </Aviso>
        )}

        {error && <Aviso tono="error">{error}</Aviso>}

        <div className="flex gap-2">
          <Boton variante="secundario" onClick={onCancelar} className="flex-1">
            Cancelar
          </Boton>
          <Boton
            onClick={() => registrar.mutate()}
            disabled={!concepto.trim() || !monto || registrar.isPending}
            className="flex-1"
          >
            {registrar.isPending ? 'Guardando…' : corrigiendo ? 'Guardar corrección' : 'Guardar'}
          </Boton>
        </div>
      </div>
  );

  return corrigiendo ? (
    <div className="mt-3 border-t border-slate-200 pt-3 dark:border-slate-800">{cuerpo}</div>
  ) : (
    <Tarjeta titulo="Prestar o cargar una deuda">{cuerpo}</Tarjeta>
  );
}
