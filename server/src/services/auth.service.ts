import type { UserRole } from '@geovanny/shared';
import { UserModel, type UserDocument } from '../models/User.js';
import { hashPassword, verifyPassword } from '../lib/password.js';
import { newTokenFamily, signAccessToken, signRefreshToken, verifyRefreshToken } from '../lib/tokens.js';
import { AuthError, ConflictError, NotFoundError } from '../lib/errors.js';
import { permissionsFor } from '../config/permissions.js';
import { env } from '../config/env.js';

export interface SessionResult {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    name: string;
    email: string;
    role: UserRole;
    permissions: string[];
    mustChangePassword: boolean;
  };
}

function present(user: UserDocument, accessToken: string, refreshToken: string): SessionResult {
  return {
    accessToken,
    refreshToken,
    user: {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      role: user.role,
      permissions: permissionsFor(user.role as UserRole),
      mustChangePassword: user.mustChangePassword,
    },
  };
}

async function issueSession(user: UserDocument, family: string): Promise<SessionResult> {
  const [accessToken, refreshToken] = await Promise.all([
    signAccessToken({ sub: user._id.toString(), role: user.role, name: user.name }),
    signRefreshToken(user._id.toString(), family),
  ]);
  return present(user, accessToken, refreshToken);
}

export async function login(email: string, password: string): Promise<SessionResult> {
  const user = await UserModel.findOne({ email: email.toLowerCase() }).select(
    '+passwordHash +refreshTokenFamily',
  );

  // Mismo mensaje para usuario inexistente y contraseña incorrecta: revelar
  // cuál de los dos falló permite enumerar cuentas.
  const genericError = new AuthError('Correo o contraseña incorrectos.');

  if (!user) {
    // Se verifica igual contra un hash señuelo para que el tiempo de respuesta
    // no delate si el usuario existe.
    await verifyPassword(
      '$argon2id$v=19$m=19456,t=2,p=1$c2VuaGFzZW5oYXNlbmhh$0000000000000000000000000000000000000000000',
      password,
    );
    throw genericError;
  }

  if (!(await verifyPassword(user.passwordHash, password))) throw genericError;
  if (!user.active) throw new AuthError('Tu usuario está desactivado. Contacta al administrador.');

  const family = newTokenFamily();
  user.refreshTokenFamily = family;
  user.lastLoginAt = new Date();
  await user.save();

  return issueSession(user, family);
}

/**
 * Rota el token de refresco.
 *
 * Si llega un refresh con una familia que ya no es la vigente, se asume robo o
 * reuso: se invalida la familia entera y se obliga a iniciar sesión otra vez.
 */
export async function refresh(token: string): Promise<SessionResult> {
  const claims = await verifyRefreshToken(token);
  const user = await UserModel.findById(claims.sub).select('+refreshTokenFamily');

  if (!user || !user.active) throw new AuthError('La sesión ya no es válida.');

  if (!user.refreshTokenFamily || user.refreshTokenFamily !== claims.family) {
    user.refreshTokenFamily = null;
    await user.save();
    throw new AuthError('Sesión invalidada por seguridad. Inicia sesión de nuevo.');
  }

  const family = newTokenFamily();
  user.refreshTokenFamily = family;
  await user.save();

  return issueSession(user, family);
}

export async function logout(userId: string): Promise<void> {
  await UserModel.findByIdAndUpdate(userId, { refreshTokenFamily: null });
}

export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const user = await UserModel.findById(userId).select('+passwordHash');
  if (!user) throw new NotFoundError('Usuario no encontrado.');

  if (!(await verifyPassword(user.passwordHash, currentPassword))) {
    throw new AuthError('La contraseña actual no es correcta.');
  }

  user.passwordHash = await hashPassword(newPassword);
  user.mustChangePassword = false;
  // Cambiar la contraseña cierra las demás sesiones.
  user.refreshTokenFamily = null;
  await user.save();
}

export async function createUser(input: {
  name: string;
  email: string;
  password: string;
  role: UserRole;
  mustChangePassword?: boolean;
}): Promise<UserDocument> {
  const exists = await UserModel.exists({ email: input.email.toLowerCase() });
  if (exists) {
    throw new ConflictError('EMAIL_IN_USE', 'Ya existe un usuario con ese correo.');
  }

  return UserModel.create({
    name: input.name,
    email: input.email.toLowerCase(),
    passwordHash: await hashPassword(input.password),
    role: input.role,
    mustChangePassword: input.mustChangePassword ?? false,
  });
}

export async function getProfile(userId: string) {
  // En modo abierto puede no haber un usuario detrás: se responde igual, para
  // que la aplicación arranque sin pedir nada.
  const user = userId ? await UserModel.findById(userId) : null;
  if (!user) {
    if (!env.ACCESO_ABIERTO) throw new NotFoundError('Usuario no encontrado.');
    return {
      id: '',
      name: 'Negocio',
      email: '',
      role: 'ADMIN' as UserRole,
      permissions: permissionsFor('ADMIN'),
      mustChangePassword: false,
      lastLoginAt: null,
      accesoAbierto: true,
    };
  }

  return {
    accesoAbierto: env.ACCESO_ABIERTO,
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    role: user.role,
    permissions: permissionsFor(user.role as UserRole),
    mustChangePassword: user.mustChangePassword,
    lastLoginAt: user.lastLoginAt,
  };
}
