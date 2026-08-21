import { Router, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { env } from '../config/env.js';
import { AuthError } from '../lib/errors.js';
import { requireAuth } from '../middleware/auth.js';
import * as authService from '../services/auth.service.js';

export const authRouter = Router();

const REFRESH_COOKIE = 'geovanny_refresh';

/** El refresh vive en una cookie httpOnly: inalcanzable para JavaScript (§43). */
function setRefreshCookie(res: Response, token: string): void {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: 'lax',
    path: `${env.API_PREFIX}/auth`,
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });
}

/** Límite estricto: el login es el objetivo natural de la fuerza bruta. */
const loginLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  limit: env.RATE_LIMIT_LOGIN_MAX,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: {
    error: {
      code: 'RATE_LIMITED',
      message: 'Demasiados intentos. Espera un momento antes de volver a intentarlo.',
    },
  },
});

const loginSchema = z.object({
  email: z.string().email('Correo inválido'),
  password: z.string().min(1, 'La contraseña es obligatoria'),
});

authRouter.post('/login', loginLimiter, async (req, res, next) => {
  try {
    const { email, password } = loginSchema.parse(req.body);
    const session = await authService.login(email, password);
    setRefreshCookie(res, session.refreshToken);
    res.json({ data: { accessToken: session.accessToken, user: session.user } });
  } catch (error) {
    next(error);
  }
});

authRouter.post('/refresh', async (req, res, next) => {
  try {
    const token = req.cookies?.[REFRESH_COOKIE] as string | undefined;
    if (!token) throw new AuthError('No hay sesión activa.');

    const session = await authService.refresh(token);
    setRefreshCookie(res, session.refreshToken);
    res.json({ data: { accessToken: session.accessToken, user: session.user } });
  } catch (error) {
    next(error);
  }
});

authRouter.post('/logout', requireAuth, async (req, res, next) => {
  try {
    await authService.logout(req.user!.id);
    res.clearCookie(REFRESH_COOKIE, { path: `${env.API_PREFIX}/auth` });
    res.json({ data: { ok: true } });
  } catch (error) {
    next(error);
  }
});

authRouter.get('/me', requireAuth, async (req, res, next) => {
  try {
    res.json({ data: await authService.getProfile(req.user!.id) });
  } catch (error) {
    next(error);
  }
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z
    .string()
    .min(8, 'La contraseña nueva debe tener al menos 8 caracteres')
    .max(200),
});

authRouter.post('/change-password', requireAuth, async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);
    await authService.changePassword(req.user!.id, currentPassword, newPassword);
    res.clearCookie(REFRESH_COOKIE, { path: `${env.API_PREFIX}/auth` });
    res.json({ data: { ok: true } });
  } catch (error) {
    next(error);
  }
});
