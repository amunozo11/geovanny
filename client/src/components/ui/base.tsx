import type { ChangeEvent, ReactNode } from 'react';

/** Piezas visuales compartidas. Pocas, grandes y con buen contraste. */

export function Tarjeta({
  titulo,
  pie,
  children,
  destacada = false,
  className = '',
}: {
  titulo?: ReactNode;
  pie?: ReactNode;
  children: ReactNode;
  destacada?: boolean;
  className?: string;
}) {
  return (
    <section
      className={[
        'rounded-xl border p-4',
        destacada
          ? 'border-slate-900 bg-slate-900 text-white dark:border-slate-700 dark:bg-slate-800'
          : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900',
        className,
      ].join(' ')}
    >
      {titulo && (
        <h2 className="mb-3 text-xs font-semibold tracking-wide uppercase opacity-60">{titulo}</h2>
      )}
      {children}
      {pie && <p className="mt-3 text-xs opacity-50">{pie}</p>}
    </section>
  );
}

export function Boton({
  children,
  onClick,
  type = 'button',
  variante = 'primario',
  disabled,
  className = '',
}: {
  children: ReactNode;
  onClick?: () => void;
  type?: 'button' | 'submit';
  variante?: 'primario' | 'secundario' | 'peligro' | 'suave';
  disabled?: boolean;
  className?: string;
}) {
  const estilos = {
    primario: 'bg-brand-600 text-white hover:bg-brand-700',
    secundario:
      'border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100',
    peligro: 'bg-rose-600 text-white hover:bg-rose-700',
    suave: 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200',
  }[variante];

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      // 48 px de alto: se puede pulsar con el dedo, en la calle y con prisa.
      className={`min-h-[48px] rounded-lg px-4 font-semibold transition disabled:opacity-40 ${estilos} ${className}`}
    >
      {children}
    </button>
  );
}

export function Campo({
  etiqueta,
  valor,
  onChange,
  tipo = 'text',
  numerico = false,
  placeholder,
  autoFocus,
  className = '',
}: {
  etiqueta?: string;
  valor: string;
  onChange: (valor: string) => void;
  tipo?: string;
  numerico?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      {etiqueta && <span className="text-xs font-medium opacity-70">{etiqueta}</span>}
      <input
        type={tipo}
        // Abre el teclado numérico en el celular, sin bloquear el punto decimal.
        inputMode={numerico ? 'decimal' : undefined}
        value={valor}
        placeholder={placeholder}
        autoFocus={autoFocus}
        onChange={(evento: ChangeEvent<HTMLInputElement>) => onChange(evento.target.value)}
        className={[
          'mt-1 w-full rounded-lg border border-slate-300 px-3 py-3',
          'dark:border-slate-700 dark:bg-slate-800',
          numerico ? 'tabular' : '',
        ].join(' ')}
      />
    </label>
  );
}

export function Seleccion<T extends string>({
  etiqueta,
  valor,
  opciones,
  onChange,
  className = '',
}: {
  etiqueta?: string;
  valor: T;
  opciones: { valor: T; texto: string }[];
  onChange: (valor: T) => void;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      {etiqueta && <span className="text-xs font-medium opacity-70">{etiqueta}</span>}
      <select
        value={valor}
        onChange={(evento) => onChange(evento.target.value as T)}
        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-3 dark:border-slate-700 dark:bg-slate-800"
      >
        {opciones.map((opcion) => (
          <option key={opcion.valor} value={opcion.valor}>
            {opcion.texto}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Aviso en pantalla. Los errores se explican en español, sin códigos. */
export function Aviso({
  tono = 'info',
  children,
}: {
  tono?: 'info' | 'error' | 'atencion' | 'bien';
  children: ReactNode;
}) {
  const estilos = {
    info: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
    error: 'bg-rose-50 text-rose-800 dark:bg-rose-950/50 dark:text-rose-200',
    atencion: 'bg-amber-50 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200',
    bien: 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200',
  }[tono];

  return <div className={`rounded-lg p-3 text-sm ${estilos}`}>{children}</div>;
}

export function Vacio({ mensaje, accion }: { mensaje: string; accion?: ReactNode }) {
  return (
    <div className="py-8 text-center">
      <p className="text-sm opacity-60">{mensaje}</p>
      {accion && <div className="mt-3">{accion}</div>}
    </div>
  );
}

export function Cargando() {
  return (
    <div className="space-y-2 py-4">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-12 animate-pulse rounded-lg bg-slate-200 dark:bg-slate-800" />
      ))}
    </div>
  );
}
