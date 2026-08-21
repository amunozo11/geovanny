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
