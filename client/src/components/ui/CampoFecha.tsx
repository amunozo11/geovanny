import { useState } from 'react';

/** `2026-08-20` de hoy, en la zona del dispositivo. */
export function hoy(): string {
  const ahora = new Date();
  const dos = (n: number) => String(n).padStart(2, '0');
  return `${ahora.getFullYear()}-${dos(ahora.getMonth() + 1)}-${dos(ahora.getDate())}`;
}

/**
 * Convierte `2026-08-19` en un instante que cae con seguridad dentro de ese día
 * del negocio. Se usa el mediodía a propósito: así ningún desfase de zona
 * horaria puede empujar el registro al día anterior o al siguiente.
 */
export function comoInstante(dia: string): string {
  return new Date(`${dia}T12:00:00`).toISOString();
}

/**
 * Fecha de la operación.
 *
 * Casi todo se registra el mismo día, así que por defecto dice "Hoy" y no
 * estorba. Pero a veces se anota al día siguiente lo que pasó ayer —eso ya lo
 * hace en el cuaderno— y entonces se despliega el calendario.
 */
export function CampoFecha({
  valor,
  onChange,
  etiqueta = '¿Qué día fue?',
}: {
  valor: string;
  onChange: (dia: string) => void;
  etiqueta?: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const esHoy = valor === hoy();

  if (!abierto && esHoy) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="text-xs opacity-60 underline"
      >
        Hoy · cambiar fecha
      </button>
    );
  }

  return (
    <label className="block">
      <span className="text-xs font-medium opacity-70">{etiqueta}</span>
      <div className="mt-1 flex items-center gap-2">
        <input
          type="date"
          value={valor}
          max={hoy()}
          onChange={(evento) => onChange(evento.target.value)}
          className="flex-1 rounded-lg border border-slate-300 px-3 py-3 dark:border-slate-700 dark:bg-slate-800"
        />
        {!esHoy && (
          <button
            type="button"
            onClick={() => {
              onChange(hoy());
              setAbierto(false);
            }}
            className="shrink-0 text-xs underline opacity-60"
          >
            Hoy
          </button>
        )}
      </div>
    </label>
  );
}

/** Los últimos N días como `2026-08-20`, del más reciente al más antiguo. */
export function diasRecientes(cuantos: number): string[] {
  const dos = (n: number) => String(n).padStart(2, '0');
  const base = new Date();
  // Mediodía: ningún cambio de horario puede empujar el cálculo un día atrás.
  base.setHours(12, 0, 0, 0);

  return Array.from({ length: cuantos }, (_, i) => {
    const fecha = new Date(base.getTime() - i * 86_400_000);
    return `${fecha.getFullYear()}-${dos(fecha.getMonth() + 1)}-${dos(fecha.getDate())}`;
  });
}

/** "Hoy", "Ayer" o "vie 20". Nadie lee fechas completas de un vistazo. */
export function etiquetaDia(dia: string): string {
  const recientes = diasRecientes(2);
  if (dia === recientes[0]) return 'Hoy';
  if (dia === recientes[1]) return 'Ayer';

  const [anio, mes, numero] = dia.split('-').map(Number);
  return new Intl.DateTimeFormat('es-CO', { weekday: 'short', day: 'numeric' }).format(
    new Date(anio!, mes! - 1, numero!),
  );
}

/**
 * Elegir día tocando, no escribiendo.
 *
 * El trabajo del negocio se organiza por días, y casi siempre es hoy o ayer.
 * Una tira de botones resuelve el 95 % de los casos con un toque; el calendario
 * queda debajo para cuando hay que ir más atrás.
 */
export function TiraDeDias({
  valor,
  onChange,
  cuantos = 10,
}: {
  valor: string;
  onChange: (dia: string) => void;
  cuantos?: number;
}) {
  const dias = diasRecientes(cuantos);

  return (
    <div>
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {dias.map((dia) => (
          <button
            key={dia}
            type="button"
            onClick={() => onChange(dia)}
            aria-pressed={valor === dia}
            className={[
              'min-h-[40px] shrink-0 rounded-lg border px-3 text-sm font-semibold whitespace-nowrap',
              valor === dia
                ? 'border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-900'
                : 'border-slate-300 dark:border-slate-700',
            ].join(' ')}
          >
            {etiquetaDia(dia)}
          </button>
        ))}
      </div>

      {/* Para ir más atrás de lo que cabe en la tira. */}
      <input
        type="date"
        value={valor}
        max={hoy()}
        onChange={(evento) => onChange(evento.target.value)}
        aria-label="Otro día"
        className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
      />
    </div>
  );
}
