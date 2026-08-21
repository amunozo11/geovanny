import { SignJWT, jwtVerify } from 'jose';
import { randomUUID } from 'node:crypto';
import type { UserRole } from '@geovanny/shared';
import { env } from '../config/env.js';
import { AuthError } from './errors.js';

const accessSecret = new TextEncoder().encode(env.JWT_SECRET);
const refreshSecret = new TextEncoder().encode(env.JWT_REFRESH_SECRET);

const ISSUER = 'geovanny';

export interface AccessClaims {
  sub: string;
  role: UserRole;
  name: string;
}

export interface RefreshClaims {
  sub: string;
  /** Familia de tokens: permite invalidar de golpe todos los de un usuario. */
  family: string;
}

export async function signAccessToken(claims: AccessClaims): Promise<string> {
  return new SignJWT({ role: claims.role, name: claims.name })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(claims.sub)
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime(env.JWT_ACCESS_TTL)
    .sign(accessSecret);
}

export async function signRefreshToken(userId: string, family: string): Promise<string> {
  return new SignJWT({ family })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setJti(randomUUID())
    .setExpirationTime(env.JWT_REFRESH_TTL)
    .sign(refreshSecret);
}

export async function verifyAccessToken(token: string): Promise<AccessClaims> {
  try {
    const { payload } = await jwtVerify(token, accessSecret, { issuer: ISSUER });
    return {
      sub: String(payload.sub),
      role: payload.role as UserRole,
      name: String(payload.name ?? ''),
    };
  } catch {
    throw new AuthError('Sesión inválida o expirada. Inicia sesión de nuevo.');
  }
}

export async function verifyRefreshToken(token: string): Promise<RefreshClaims> {
  try {
    const { payload } = await jwtVerify(token, refreshSecret, { issuer: ISSUER });
    return { sub: String(payload.sub), family: String(payload.family) };
  } catch {
    throw new AuthError('La sesión expiró. Inicia sesión de nuevo.');
  }
}

export function newTokenFamily(): string {
  return randomUUID();
}
