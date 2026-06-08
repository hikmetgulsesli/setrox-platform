import { Router, type Request, type Response, type NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import {
  AuthRegisterRequestSchema,
  AuthLoginRequestSchema,
  AuthRefreshRequestSchema,
} from '@setrox/shared/schemas';
import { prisma } from '../config/database';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  hashToken,
} from '../utils/jwt';
import { BadRequestError, UnauthorizedError, ConflictError } from '../utils/errors';
import { authRateLimit } from '../middleware/rateLimit';

export const authRouter = Router({ mergeParams: true });

// Wrap async handlers to forward errors to the error middleware
const wrap = (fn: (req: Request, res: Response) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) => {
    fn(req, res).catch(next);
  };

authRouter.post('/register', authRateLimit, wrap(async (req, res) => {
  const data = AuthRegisterRequestSchema.parse(req.body);
  const appSlug = req.params.appSlug;
  if (!appSlug) throw new BadRequestError('Missing app slug');

  const application = await prisma.application.findUnique({ where: { slug: appSlug } });
  if (!application) throw new BadRequestError('Invalid app');

  const externalUserId = `usr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const passwordHash = await bcrypt.hash(data.password, 12);

  const appUser = await prisma.appUser.create({
    data: {
      applicationId: application.id,
      externalUserId,
      email: data.email,
      displayName: data.displayName,
      passwordHash,
    },
  });

  // Issue tokens
  const refreshTokenPlain = signRefreshToken({ appUserId: appUser.id, tokenId: 'placeholder' });
  const refreshTokenId = `rt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const finalRefresh = signRefreshToken({ appUserId: appUser.id, tokenId: refreshTokenId });
  const tokenHash = hashToken(finalRefresh);
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  await prisma.refreshToken.create({
    data: { id: refreshTokenId, appUserId: appUser.id, tokenHash, expiresAt },
  });

  const accessToken = signAccessToken({
    appUserId: appUser.id,
    applicationId: application.id,
    externalUserId: appUser.externalUserId,
    email: appUser.email,
    isPremium: appUser.isPremium,
    plan: (appUser.plan as 'free' | 'pro' | 'pro_plus') ?? 'free',
    trialEndsAt: appUser.trialEndsAt?.toISOString() ?? null,
    dailyQuota: appUser.dailyQuota ?? -1,
  });

  res.status(201).json({
    accessToken,
    refreshToken: finalRefresh,
    user: {
      id: appUser.externalUserId,
      email: appUser.email,
      displayName: appUser.displayName,
      isPremium: appUser.isPremium,
    plan: (appUser.plan as 'free' | 'pro' | 'pro_plus') ?? 'free',
    trialEndsAt: appUser.trialEndsAt?.toISOString() ?? null,
    },
  });
}));

authRouter.post('/login', authRateLimit, wrap(async (req, res) => {
  const data = AuthLoginRequestSchema.parse(req.body);
  const appSlug = req.params.appSlug;
  if (!appSlug) throw new BadRequestError('Missing app slug');

  const application = await prisma.application.findUnique({ where: { slug: appSlug } });
  if (!application) throw new BadRequestError('Invalid app');

  const appUser = await prisma.appUser.findFirst({
    where: { applicationId: application.id, email: data.email },
  });
  if (!appUser || !appUser.passwordHash) {
    throw new UnauthorizedError('Invalid credentials');
  }

  const valid = await bcrypt.compare(data.password, appUser.passwordHash);
  if (!valid) throw new UnauthorizedError('Invalid credentials');

  // Rotate refresh token
  const refreshTokenId = `rt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const finalRefresh = signRefreshToken({ appUserId: appUser.id, tokenId: refreshTokenId });
  const tokenHash = hashToken(finalRefresh);
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  await prisma.refreshToken.create({
    data: { id: refreshTokenId, appUserId: appUser.id, tokenHash, expiresAt },
  });

  const accessToken = signAccessToken({
    appUserId: appUser.id,
    applicationId: application.id,
    externalUserId: appUser.externalUserId,
    email: appUser.email,
    isPremium: appUser.isPremium,
    plan: (appUser.plan as 'free' | 'pro' | 'pro_plus') ?? 'free',
    trialEndsAt: appUser.trialEndsAt?.toISOString() ?? null,
    dailyQuota: appUser.dailyQuota ?? -1,
  });

  res.json({
    accessToken,
    refreshToken: finalRefresh,
    user: {
      id: appUser.externalUserId,
      email: appUser.email,
      displayName: appUser.displayName,
      isPremium: appUser.isPremium,
    plan: (appUser.plan as 'free' | 'pro' | 'pro_plus') ?? 'free',
    trialEndsAt: appUser.trialEndsAt?.toISOString() ?? null,
    },
  });
}));

authRouter.post('/refresh', wrap(async (req, res) => {
  const data = AuthRefreshRequestSchema.parse(req.body);
  const payload = verifyRefreshToken(data.refreshToken);

  // Verify the token is still valid in DB
  const tokenHash = hashToken(data.refreshToken);
  const stored = await prisma.refreshToken.findUnique({
    where: { id: payload.tokenId },
  });
  if (!stored || stored.tokenHash !== tokenHash || stored.revokedAt) {
    throw new UnauthorizedError('Refresh token revoked');
  }
  if (stored.expiresAt < new Date()) {
    throw new UnauthorizedError('Refresh token expired');
  }

  const appUser = await prisma.appUser.findUnique({
    where: { id: stored.appUserId },
    include: { application: true },
  });
  if (!appUser) throw new UnauthorizedError('User not found');

  // Revoke old, issue new (token rotation)
  await prisma.refreshToken.update({
    where: { id: stored.id },
    data: { revokedAt: new Date() },
  });

  const newRefreshId = `rt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const newRefresh = signRefreshToken({ appUserId: appUser.id, tokenId: newRefreshId });
  const newHash = hashToken(newRefresh);
  await prisma.refreshToken.create({
    data: {
      id: newRefreshId,
      appUserId: appUser.id,
      tokenHash: newHash,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  });

  const accessToken = signAccessToken({
    appUserId: appUser.id,
    applicationId: appUser.applicationId,
    externalUserId: appUser.externalUserId,
    email: appUser.email,
    isPremium: appUser.isPremium,
    plan: (appUser.plan as 'free' | 'pro' | 'pro_plus') ?? 'free',
    trialEndsAt: appUser.trialEndsAt?.toISOString() ?? null,
    dailyQuota: appUser.dailyQuota ?? -1,
  });

  res.json({ accessToken, refreshToken: newRefresh });
}));

authRouter.post('/logout', wrap(async (req, res) => {
  const data = AuthRefreshRequestSchema.parse(req.body);
  try {
    const payload = verifyRefreshToken(data.refreshToken);
    await prisma.refreshToken.update({
      where: { id: payload.tokenId },
      data: { revokedAt: new Date() },
    }).catch(() => {/* ignore if not found */});
  } catch {
    // Even if token is invalid, treat logout as success
  }
  res.status(204).end();
}));
