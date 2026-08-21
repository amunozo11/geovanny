import type { NextFunction, Request, Response } from 'express';
import type { UserRole } from '@geovanny/shared';
import { AuthError, ForbiddenError } from '../lib/errors.js';
import { verifyAccessToken } from '../lib/tokens.js';
import { can, type Permission } from '../config/permissions.js';
import { env } from '../config/env.js';
import { UserModel } from '../models/User.js';

declare module 'express-serve-static-core' {
  interface Request {
    user?: { id: string; role: UserRole; name: string };
  }
}

/**
 * En modo abierto todo el mundo entra como administrador.
 *
 * Se busca el administrador real una sola vez para que las operaciones queden
 * firmadas por alguien y el historial no se llene de registros sin autor.
 */
let administrador: { id: string; role: UserRole; name: string } | null = null;

async function usuarioDelModoAbierto() {
  if (administrador) return administrador;

  const encontrado = await UserModel.findOne({ role: 'ADMIN' }).sort({ createdAt: 1 });
  administrador = {
    id: encontrado?._id.toString() ?? '',
    role: 'ADMIN',
    name: encontrado?.name ?? 'Negocio',
  };
  return administrador;
}

/** Exige sesión válida, salvo que el acceso abierto esté encendido. */
export async function requireAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (env.ACCESO_ABIERTO) {
      req.user = await usuarioDelModoAbierto();
      next();
      return;
    }

    const header = req.header('Authorization');
    if (!header?.startsWith('Bearer ')) {
      throw new AuthError('Falta el token de acceso.');
    }
    const claims = await verifyAccessToken(header.slice(7));
    req.user = { id: claims.sub, role: claims.role, name: claims.name };
    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Exige un permiso concreto (§42).
 *
 * Se comprueba por permiso y no por rol: así, añadir un rol nuevo no obliga a
 * tocar cada endpoint, solo la matriz de `config/permissions.ts`.
 */
export function requirePermission(permission: Permission) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new AuthError('Falta el token de acceso.'));
      return;
    }
    if (!can(req.user.role, permission)) {
      next(
        new ForbiddenError(`Tu rol (${req.user.role}) no puede realizar esta acción.`, {
          rule: 'RC-43',
          details: { permission },
        }),
      );
      return;
    }
    next();
  };
}
