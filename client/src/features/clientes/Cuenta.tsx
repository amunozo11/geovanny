import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { D, MONEDAS, formatMoney, money, type Moneda } from '@geovanny/shared';
import type { ApiError } from '../../lib/api';
import { api } from '../../lib/api';
import { useMoneda } from '../moneda/contexto';
import { SelectorCaja } from '../cajas/SelectorCaja';
import { Aviso, Boton, Campo, Cargando, Seleccion, Tarjeta, Vacio } from '../../components/ui/base';
import { useAuth } from '../auth/AuthContext';
import type { Cargo, Operacion, Pago, Persona } from '../../lib/tipos';

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
                <FilaOperacion key={movimiento.dato.id} operacion={movimiento.dato} />
              ) : movimiento.tipo === 'pago' ? (
                <FilaPago key={movimiento.dato.id} pago={movimiento.dato} />
              ) : (
                <FilaCargo key={movimiento.dato.id} cargo={movimiento.dato} />
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

function FilaOperacion({ operacion }: { operacion: Operacion }) {
  const pendiente = D(operacion.saldo).greaterThan(0);

  return (
    <li className="py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">
            {operacion.numero} · {new Date(operacion.fecha).toLocaleDateString('es-CO')}
          </p>
          <p className="truncate text-xs opacity-60">
            {operacion.items
              .map((i) => `${i.cantidad} ${i.nombre.toLowerCase()}`)
              .join(' · ')}
          </p>
        </div>
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
    </li>
  );
}

function FilaPago({ pago }: { pago: Pago }) {
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
    </li>
  );
}

/**
 * Abono, incluido el caso difícil: la deuda está en dólares y paga en bolívares.
 * La pantalla muestra en todo momento cuánto se descuenta de la deuda y con qué
 * tasa, para que no haya sorpresas al cuadrar (§8, §21).
 */
function FormularioAbono({
  persona,
  onListo,
  onCancelar,
}: {
  persona: Persona;
  onListo: () => void;
  onCancelar: () => void;
}) {
  const deudas = MONEDAS.filter((m) => D(persona.saldos?.[m] ?? '0').greaterThan(0));
  const [aplicaA, setAplicaA] = useState<Moneda>(deudas[0] ?? 'VES');
  const [moneda, setMoneda] = useState<Moneda>(deudas[0] ?? 'VES');
  const [monto, setMonto] = useState('');
  const [cajaId, setCajaId] = useState('');
  const [error, setError] = useState<string | null>(null);

  const registrar = useMutation({
    mutationFn: () =>
      api('/pagos', {
        method: 'POST',
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

  return (
    <Tarjeta titulo="Registrar abono">
      <div className="space-y-3">
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
          <Campo etiqueta="¿Cuánto abona?" valor={monto} onChange={setMonto} numerico autoFocus />
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
            {registrar.isPending ? 'Guardando…' : 'Guardar abono'}
          </Boton>
        </div>
      </div>
    </Tarjeta>
  );
}

const ETIQUETA_CARGO: Record<Cargo['tipo'], string> = {
  PRESTAMO: 'Préstamo',
  DEUDA: 'Deuda',
  AJUSTE: 'Ajuste',
};

function FilaCargo({ cargo }: { cargo: Cargo }) {
  const pendiente = D(cargo.saldo).greaterThan(0);

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
  onListo,
  onCancelar,
}: {
  persona: Persona;
  onListo: () => void;
  onCancelar: () => void;
}) {
  const [tipo, setTipo] = useState<Cargo['tipo']>('PRESTAMO');
  const [concepto, setConcepto] = useState('');
  const [monto, setMonto] = useState('');
  const [moneda, setMoneda] = useState<Moneda>('VES');
  const [cajaId, setCajaId] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Prestar entrega dinero; anotar una deuda vieja o corregir un saldo, no.
  const salioDeCaja = tipo === 'PRESTAMO';

  const registrar = useMutation({
    mutationFn: () =>
      api('/cargos', {
        method: 'POST',
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

  return (
    <Tarjeta titulo="Prestar o cargar una deuda">
      <div className="space-y-3">
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
          <Campo etiqueta="Cuánto" valor={monto} onChange={setMonto} numerico />
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
            {registrar.isPending ? 'Guardando…' : 'Guardar'}
          </Boton>
        </div>
      </div>
    </Tarjeta>
  );
}
