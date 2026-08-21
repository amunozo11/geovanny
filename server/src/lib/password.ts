import { hash, verify } from '@node-rs/argon2';

/**
 * Hash de contraseñas con **argon2id** (§43, RC-42).
 *
 * Parámetros según la recomendación OWASP: 19 MiB de memoria, 2 iteraciones,
 * paralelismo 1. Argon2id resiste ataques por GPU mucho mejor que bcrypt, que
 * es lo que importa si alguna vez se filtra la base.
 */
const OPTIONS = {
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

export function hashPassword(plain: string): Promise<string> {
  return hash(plain, OPTIONS);
}

export async function verifyPassword(hashed: string, plain: string): Promise<boolean> {
  try {
    return await verify(hashed, plain, OPTIONS);
  } catch {
    // Un hash corrupto o de otro algoritmo no debe tumbar el login:
    // se trata como contraseña incorrecta.
    return false;
  }
}
