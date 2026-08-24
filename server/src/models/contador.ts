import { Schema, model, type ClientSession } from 'mongoose';

/**
 * Numeración correlativa sin huecos (RP-07): V-0001, C-0001, P-0001, G-0001.
 *
 * Se usa `findOneAndUpdate` con `$inc`, que es atómico: dos ventas simultáneas
 * nunca pueden recibir el mismo número. Contar documentos para numerar —el
 * error habitual— sí lo permitiría.
 *
 * La clave es solo el prefijo, **sin el año**. Antes era `V:2026`, y como el
 * número que se escribe (`V-0001`) no lleva el año y el índice de `numero` es
 * único para siempre, el 1 de enero el contador habría vuelto a empezar en cero
 * y la primera venta del año habría chocado con la primera del año anterior. El
 * sistema entero se habría caído esa mañana.
 */
interface Contador {
  _id: string;
  seq: number;
}

const contadorSchema = new Schema<Contador>({
  _id: { type: String, required: true },
  seq: { type: Number, default: 0 },
});

export const ContadorModel = model<Contador>('Contador', contadorSchema);

export async function siguienteNumero(
  prefijo: string,
  session?: ClientSession,
): Promise<string> {
  const contador = await ContadorModel.findByIdAndUpdate(
    prefijo,
    { $inc: { seq: 1 } },
    { upsert: true, new: true, session },
  );

  return `${prefijo}-${String(contador.seq).padStart(4, '0')}`;
}

/** `D-0066` → `66`. Devuelve 0 si el número no tiene la forma esperada. */
export function secuenciaDe(numero: string | null | undefined): number {
  const partes = String(numero ?? '').split('-');
  const valor = Number(partes[partes.length - 1]);
  return Number.isFinite(valor) ? valor : 0;
}

/**
 * Pone el contador por encima del número más alto que ya exista.
 *
 * Es la red de seguridad. El contador vive en un documento aparte de los
 * documentos que numera, así que puede quedarse atrás: una importación hecha
 * por fuera, una restauración de copia, alguien que borra la colección de
 * contadores. Cuando eso pasa, el contador reparte números que ya existen y
 * cada intento de guardar muere con un choque de clave duplicada — un error que
 * quien está vendiendo no puede resolver de ninguna manera.
 *
 * `$max` solo sube, nunca baja: si el contador ya iba por delante (números
 * repartidos a documentos que luego se borraron), se respeta.
 */
export async function sincronizarContador(
  prefijo: string,
  numerosExistentes: readonly string[],
): Promise<number> {
  const mayor = numerosExistentes.reduce((maximo, n) => Math.max(maximo, secuenciaDe(n)), 0);
  if (mayor === 0) return 0;

  await ContadorModel.updateOne({ _id: prefijo }, { $max: { seq: mayor } }, { upsert: true });
  return mayor;
}
