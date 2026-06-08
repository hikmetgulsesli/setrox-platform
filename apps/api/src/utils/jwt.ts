import jwt, { type SignOptions } from 'jsonwebtoken';
import crypto from 'node:crypto';
import { env } from '../config/env';
import { UnauthorizedError } from './errors';

export interface AccessTokenPayload {
  appUserId: string;
  applicationId: string;
  externalUserId: string;
  email: string | null;
  isPremium: boolean;
  plan: 'free' | 'pro' | 'pro_plus';
  trialEndsAt: string | null;
  dailyQuota: number;
}

export interface AdminTokenPayload {
  adminId: string;
  email: string;
  role: 'superadmin' | 'admin' | 'viewer';
}

export function signAccessToken(payload: AccessTokenPayload): string {
  const opts: SignOptions = { expiresIn: env.JWT_ACCESS_TTL as SignOptions['expiresIn'] };
  return jwt.sign(payload, env.JWT_SECRET, opts);
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as AccessTokenPayload;
    return decoded;
  } catch (err) {
    throw new UnauthorizedError((err as Error).message);
  }
}

export function signRefreshToken(payload: { appUserId: string; tokenId: string }): string {
  const opts: SignOptions = { expiresIn: env.JWT_REFRESH_TTL as SignOptions['expiresIn'] };
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, opts);
}

export function verifyRefreshToken(token: string): { appUserId: string; tokenId: string } {
  try {
    return jwt.verify(token, env.JWT_REFRESH_SECRET) as { appUserId: string; tokenId: string };
  } catch (err) {
    throw new UnauthorizedError((err as Error).message);
  }
}

export function signAdminToken(payload: AdminTokenPayload): string {
  const opts: SignOptions = { expiresIn: '8h' as SignOptions['expiresIn'] };
  return jwt.sign(payload, env.JWT_SECRET, opts);
}

export function verifyAdminToken(token: string): AdminTokenPayload {
  try {
    return jwt.verify(token, env.JWT_SECRET) as AdminTokenPayload;
  } catch (err) {
    throw new UnauthorizedError((err as Error).message);
  }
}

export function hashToken(token: string): string {
  // Simple hash for storing tokens in DB (no need for bcrypt speed-wise,
  // but we want collision resistance, not reversibility)
  return crypto.createHash('sha256').update(token).digest('hex');
}
