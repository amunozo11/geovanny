import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import { corsOrigins, env, isProduction } from './config/env.js';
import { requestId } from './middleware/requestId.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { apiRouter } from './routes/index.js';
import { ForbiddenError } from './lib/errors.js';

const aqui = path.dirname(fileURLToPath(import.meta.url));

/**
 * En producción el mismo servidor entrega la aplicación y la API.
 *
 * Una sola dirección y una sola cosa que publicar: no hay CORS que configurar,
 * ni dos despliegues que mantener sincronizados, ni un cliente apuntando a una
 * API que cambió de sitio. Para este negocio es la opción sensata.
 */
const CARPETA_CLIENTE = path.resolve(aqui, '../../client/dist');

export function createApp() {
  const app = express();

  // Detrás de Render/Fly/Nginx: necesario para que el rate limit vea la IP real.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(
    helmet({
      // La aplicación y la API viven en el mismo origen y no cargan nada de
      // fuera, así que la política por defecto sirve; solo se permite que el
      // navegador muestre las fuentes del sistema y las imágenes propias.
      contentSecurityPolicy: isProduction
        ? {
            directives: {
              defaultSrc: ["'self'"],
              scriptSrc: ["'self'"],
              styleSrc: ["'self'", "'unsafe-inline'"],
              imgSrc: ["'self'", 'data:'],
              connectSrc: ["'self'"],
              objectSrc: ["'none'"],
              frameAncestors: ["'none'"],
            },
          }
        : false,
    }),
  );

  /**
   * La aplicación y la API viven en la misma dirección, así que lo primero es
   * permitir las peticiones que vienen de la propia página.
   *
   * Sin esto, cualquier POST desde la aplicación publicada fallaría salvo que
   * alguien se acordara de poner la dirección exacta en `CORS_ALLOWED_ORIGINS`
   * — y esa dirección no se conoce hasta después de desplegar.
   */
  app.use(
    cors((peticion, callback) => {
      const origen = peticion.headers.origin;

      // Sin origen: petición del propio servidor, de curl o de una app nativa.
      if (!origen) return callback(null, { origin: true, credentials: true });

      const mismaDireccion = (() => {
        try {
          return new URL(origen).host === peticion.headers.host;
        } catch {
          return false;
        }
      })();

      if (mismaDireccion || corsOrigins.includes(origen)) {
        return callback(null, { origin: true, credentials: true });
      }

      // Un error corriente saldría como 500 y parecería un fallo del servidor;
      // esto es un rechazo deliberado y debe decirlo.
      return callback(new ForbiddenError(`Origen no permitido: ${origen}`));
    }),
  );

  app.use(express.json({ limit: env.BODY_LIMIT }));
  app.use(express.urlencoded({ extended: true, limit: env.BODY_LIMIT }));
  app.use(cookieParser());
  app.use(requestId);

  app.use(
    rateLimit({
      windowMs: env.RATE_LIMIT_WINDOW_MS,
      limit: env.RATE_LIMIT_MAX,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      // Los archivos de la aplicación no deben gastar el cupo de peticiones.
      skip: (req) => !req.path.startsWith(env.API_PREFIX),
      message: {
        error: {
          code: 'RATE_LIMITED',
          message: 'Demasiadas peticiones. Espera un momento e inténtalo de nuevo.',
        },
      },
    }),
  );

  app.use(env.API_PREFIX, apiRouter);

  // En Vercel los archivos de la aplicación los sirve la propia plataforma y no
  // viajan dentro de la función, así que puede no haber nada que servir aquí.
  const sirveLaAplicacion = isProduction && fs.existsSync(CARPETA_CLIENTE);

  if (sirveLaAplicacion) {
    // Los archivos con huella (index-a1b2c3.js) se pueden cachear para siempre;
    // el index.html no, porque es el que apunta a las versiones nuevas.
    app.use(express.static(CARPETA_CLIENTE, { maxAge: '1y', index: false }));

    app.use((req, res, siguiente) => {
      if (req.method !== 'GET' || req.path.startsWith(env.API_PREFIX)) return siguiente();
      res.sendFile(path.join(CARPETA_CLIENTE, 'index.html'));
    });
  }

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
