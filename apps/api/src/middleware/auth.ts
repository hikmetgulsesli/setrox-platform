import type { NextFunction, Request, Response } from 'express';
import crypto from 'node:crypto';
import { prisma } from '../config/database';
import { UnauthorizedError, ForbiddenError } from '../utils/errors';

// ====== Extension types for Express request ======
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      appContext?: {
        application?: {
          id: string;
          slug: string;
          name: string;
          isActive: boolean;
          freeQuotaPerDay: number;
          proQuotaPerDay: number;
          trialDays: number;
          priceMonthlyCents: number;
          priceYearlyCents: number;
          priceProPlusMonthlyCents: number;
          priceProPlusYearlyCents: number;
        };
        appUser?: {
          id: string;
          externalUserId: string;
          email: string | null;
          isPremium: boolean;
          plan: 'free' | 'pro' | 'pro_plus';
          trialEndsAt: string | null;
          dailyQuota: number;
        };
        adminUser?: {
          id: string;
          email: string;
          role: 'superadmin' | 'admin' | 'viewer';
        };
      };
    }
  }
}

/**
 * App-level auth: validates the application's API key in `X-Api-Key` header.
 * Required for ALL /v1/apps/:appSlug/* routes.
 */
export async function appAuthMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const appSlug = req.params.appSlug;
    if (!appSlug) {
      throw new UnauthorizedError('Missing app slug');
    }

    const apiKey = req.header('X-Api-Key');
    if (!apiKey) {
      throw new UnauthorizedError('Missing X-Api-Key header');
    }

    const application = await prisma.application.findUnique({
      where: { slug: appSlug },
    });

    if (!application) {
      throw new UnauthorizedError('Invalid app');
    }
    if (!application.isActive) {
      throw new ForbiddenError('App is disabled');
    }

    // Constant-time compare to prevent timing attacks
    const expected = application.apiKey;
    const ok =
      expected.length === apiKey.length &&
      crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(apiKey));

    if (!ok) {
      throw new UnauthorizedError('Invalid API key');
    }

    req.appContext = {
      application: {
        id: application.id,
        slug: application.slug,
        name: application.name,
        isActive: application.isActive,
        freeQuotaPerDay: application.freeQuotaPerDay,
        proQuotaPerDay: application.proQuotaPerDay,
        trialDays: application.trialDays,
        priceMonthlyCents: application.priceMonthlyCents,
        priceYearlyCents: application.priceYearlyCents,
        priceProPlusMonthlyCents: application.priceProPlusMonthlyCents,
        priceProPlusYearlyCents: application.priceProPlusYearlyCents,
      },
    };
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * User-level auth: validates JWT in `Authorization: Bearer <token>`.
 * Optional for some endpoints, required for others.
 */
export async function userAuthMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const auth = req.header('Authorization');
    if (!auth?.startsWith('Bearer ')) {
      throw new UnauthorizedError('Missing bearer token');
    }

    const token = auth.slice(7);
    const { verifyAccessToken } = await import('../utils/jwt.js');
    const payload = verifyAccessToken(token);

    req.appContext = {
      ...req.appContext!,
      appUser: {
        id: payload.appUserId,
        externalUserId: payload.externalUserId,
        email: payload.email,
        isPremium: payload.isPremium,
        plan: payload.plan,
        trialEndsAt: payload.trialEndsAt,
        dailyQuota: payload.dailyQuota,
      },
    };
    next();
  } catch (err) {
    if ((err as Error).name === 'TokenExpiredError') {
      next(new UnauthorizedError('Token expired'));
      return;
    }
    if ((err as Error).name === 'JsonWebTokenError') {
      next(new UnauthorizedError('Invalid token'));
      return;
    }
    next(err);
  }
}

export function requireUser(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  if (!req.appContext?.appUser) {
    next(new UnauthorizedError('Authentication required'));
    return;
  }
  next();
}

/**
 * Admin auth: separate JWT signed with admin secret, used for /v1/admin/*.
 */
export async function adminAuthMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const auth = req.header('Authorization');
    if (!auth?.startsWith('Bearer ')) {
      throw new UnauthorizedError('Missing bearer token');
    }

    const token = auth.slice(7);
    const { verifyAdminToken } = await import('../utils/jwt.js');
    const payload = verifyAdminToken(token);

    req.appContext = {
      ...req.appContext,
      adminUser: {
        id: payload.adminId,
        email: payload.email,
        role: payload.role,
      },
    };
    next();
  } catch (err) {
    next(err);
  }
}

export function requireAdmin(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  if (!req.appContext?.adminUser) {
    next(new UnauthorizedError('Admin authentication required'));
    return;
  }
  if (req.appContext.adminUser.role === 'viewer') {
    next(new ForbiddenError('Viewers cannot modify'));
    return;
  }
  next();
}
