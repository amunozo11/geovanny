import { env } from '../config/env.js';

/**
 * El día del negocio, no el del servidor.
 *
 * Las fechas se guardan en UTC, pero "hoy" significa el día en Colombia. Una
 * venta de las 8 de la noche ocurre a la 1 de la madrugada UTC del día
 * siguiente: si se agrupara por día UTC, aparecería en el día equivocado y los
 * totales del cierre no cuadrarían con lo que él vio en la calle.
 */
export const ZONA = env.TZ_NEGOCIO;

/** Minutos de diferencia entre la zona del negocio y UTC en un instante dado. */
function desfaseMinutos(instante: Date): number {
  const formato = new Intl.DateTimeFormat('en-US', {
    timeZone: ZONA,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  const partes = Object.fromEntries(
    formato.formatToParts(instante).map((parte) => [parte.type, parte.value]),
  ) as Record<string, string>;

  const comoSiFueraUtc = Date.UTC(
    Number(partes.year),
    Number(partes.month) - 1,
    Number(partes.day),
    // A medianoche local, la hora formateada es "24" en algunos entornos.
    Number(partes.hour) % 24,
    Number(partes.minute),
    Number(partes.second),
  );

  return (comoSiFueraUtc - instante.getTime()) / 60_000;
}

/** Fecha del negocio en formato `2026-08-20`. */
export function diaDeHoy(instante = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONA,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instante);
}

/** Instante UTC en que empieza un día del negocio. */
export function inicioDelDia(dia: string): Date {
  const [anio, mes, numero] = dia.split('-').map(Number);
  const medianocheUtc = Date.UTC(anio!, mes! - 1, numero!, 0, 0, 0);
  const desfase = desfaseMinutos(new Date(medianocheUtc));
  return new Date(medianocheUtc - desfase * 60_000);
}

/** Rango `[desde, hasta)` que cubre un día completo del negocio. */
export function rangoDelDia(dia: string): { desde: Date; hasta: Date } {
  const desde = inicioDelDia(dia);
  const siguiente = new Date(desde.getTime() + 26 * 3_600_000);
  return { desde, hasta: inicioDelDia(diaDeHoy(siguiente)) };
}

/** Primer instante del mes actual del negocio. */
export function inicioDelMes(instante = new Date()): Date {
  const dia = diaDeHoy(instante);
  return inicioDelDia(`${dia.slice(0, 8)}01`);
}

/** Los últimos N días del negocio, del más reciente al más antiguo. */
export function ultimosDias(cantidad: number): string[] {
  const dias: string[] = [];
  const hoy = inicioDelDia(diaDeHoy());
  for (let i = 0; i < cantidad; i += 1) {
    dias.push(diaDeHoy(new Date(hoy.getTime() - i * 24 * 3_600_000)));
  }
  return dias;
}
