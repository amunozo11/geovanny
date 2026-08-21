/**
 * Puerta de entrada en Vercel.
 *
 * Vercel no deja un servidor encendido: despierta esta función cuando llega una
 * petición y la vuelve a dormir. Eso cambia dos cosas respecto a un servidor
 * normal:
 *
 * 1. **La conexión a la base se reutiliza entre peticiones.** Se guarda en una
 *    variable del módulo, que Vercel conserva mientras la instancia siga
 *    caliente. Sin esto, cada petición abriría una conexión nueva a MongoDB y
 *    acabaría agotando el límite de Atlas.
 * 2. **La preparación se hace una sola vez por instancia**, no en cada
 *    petición: crear catálogos, productos y cajas es idempotente, pero repetirlo
 *    en cada llamada sería tiempo perdido.
 */
import { createApp } from '../server/dist/app.js';
import { connectDatabase } from '../server/dist/lib/db.js';
import { sembrar } from '../server/dist/seed/index.js';
import { logger } from '../server/dist/lib/logger.js';

const app = createApp();

/** Promesa compartida: la primera petición prepara, las demás esperan a esa. */
let preparacion = null;

async function preparar() {
  await connectDatabase();
  try {
    await sembrar();
  } catch (error) {
    // Si la preparación falla, la aplicación debe seguir respondiendo: puede
    // ser solo que no haya internet para consultar la tasa.
    logger.error({ err: error }, 'No se pudo preparar la base');
  }
}

export default async function handler(peticion, respuesta) {
  if (!preparacion) {
    preparacion = preparar().catch((error) => {
      // Se limpia para que la siguiente petición vuelva a intentarlo en vez de
      // quedarse con un fallo pegado para siempre.
      preparacion = null;
      throw error;
    });
  }

  try {
    await preparacion;
  } catch (error) {
    logger.error({ err: error }, 'Sin conexión a la base');
    respuesta.status(503).json({
      error: {
        code: 'BASE_NO_DISPONIBLE',
        message: 'No se pudo conectar con la base de datos. Inténtalo de nuevo.',
      },
    });
    return;
  }

  return app(peticion, respuesta);
}
