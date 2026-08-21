import type { UserRole } from '@geovanny/shared';

/**
 * Matriz de permisos (§42, API.md "Matriz de permisos").
 *
 * Un solo archivo, legible de un vistazo: si algún día hay que responder
 * "¿quién puede anular una venta?", se responde aquí y no rebuscando en
 * veinte controladores.
 */
export const PERMISSIONS = [
  'sale:create',
  'sale:read',
  'sale:void',
  'purchase:create',
  'purchase:read',
  'purchase:void',
  'payment:create',
  'payment:void',
  'supplier_payment:create',
  'receivable:read',
  'payable:read',
  'inventory:read',
  'inventory:adjust',
  'product:read',
  'product:write',
  'customer:read',
  'customer:write',
  'supplier:read',
  'supplier:write',
  'expense:read',
  'expense:write',
  'rate:read',
  'rate:write',
  'report:read',
  'settings:read',
  'settings:write',
  'user:manage',
  'audit:read',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const VENDEDOR: Permission[] = [
  'sale:create',
  'sale:read',
  'payment:create',
  'receivable:read',
  'inventory:read',
  'product:read',
  'customer:read',
  'customer:write',
  'rate:read',
  'report:read',
];

/** Perfil de la hoja `WILMER`: solo consulta para salir a cobrar (CN-*). */
const CAJERO: Permission[] = [
  'sale:create',
  'sale:read',
  'payment:create',
  'receivable:read',
  'payable:read',
  'inventory:read',
  'product:read',
  'customer:read',
  'expense:read',
  'expense:write',
  'rate:read',
  'rate:write',
  'report:read',
];

const CONSULTA: Permission[] = [
  'sale:read',
  'purchase:read',
  'receivable:read',
  'payable:read',
  'inventory:read',
  'product:read',
  'customer:read',
  'supplier:read',
  'expense:read',
  'rate:read',
  'report:read',
];

export const ROLE_PERMISSIONS: Record<UserRole, readonly Permission[]> = {
  ADMIN: PERMISSIONS,
  VENDEDOR: VENDEDOR,
  CAJERO: CAJERO,
  CONSULTA: CONSULTA,
};

export function can(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export function permissionsFor(role: UserRole): Permission[] {
  return [...ROLE_PERMISSIONS[role]];
}
