import { Schema, model, type HydratedDocument } from 'mongoose';
import { USER_ROLES, type UserRole } from '@geovanny/shared';

/**
 * Usuario del sistema (DATABASE.md §1).
 *
 * `passwordHash` NUNCA sale del servidor: se excluye por defecto con
 * `select: false`, para que ni un `find()` descuidado pueda filtrarlo.
 */
export interface User {
  name: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  active: boolean;
  lastLoginAt: Date | null;
  /**
   * Familia de tokens de refresco. Al cerrar sesión, o al detectar el reuso de
   * un token ya rotado, se cambia este valor y todos los refresh emitidos antes
   * quedan invalidados de golpe.
   */
  refreshTokenFamily: string | null;
  mustChangePassword: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type UserDocument = HydratedDocument<User>;

const userSchema = new Schema<User>(
  {
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: USER_ROLES, required: true, default: 'CONSULTA' },
    active: { type: Boolean, default: true },
    lastLoginAt: { type: Date, default: null },
    refreshTokenFamily: { type: String, default: null, select: false },
    mustChangePassword: { type: Boolean, default: false },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret: Record<string, unknown>) {
        delete ret.passwordHash;
        delete ret.refreshTokenFamily;
        return ret;
      },
    },
  },
);

export const UserModel = model<User>('User', userSchema);
