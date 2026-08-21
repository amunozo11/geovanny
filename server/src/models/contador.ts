import { Schema, model, type ClientSession } from 'mongoose';

/**
 * Numeración correlativa sin huecos (RP-07): V-0001, C-0001, P-0001, G-0001.
 *
 * Se usa `findOneAndUpdate` con `$inc`, que es atómico: dos ventas simultáneas
 * nunca pueden recibir el mismo número. Contar documentos para numerar —el
 * error habitual— sí lo permitiría.
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
  const anio = new Date().getFullYear();
  const clave = `${prefijo}:${anio}`;

  const contador = await ContadorModel.findByIdAndUpdate(
    clave,
    { $inc: { seq: 1 } },
    { upsert: true, new: true, session },
  );

  return `${prefijo}-${String(contador.seq).padStart(4, '0')}`;
}
