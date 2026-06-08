import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import {
  VerifyReceiptRequestSchema,
  StartTrialRequestSchema,
  CancelSubscriptionRequestSchema,
} from '@setrox/shared/schemas';
import { prisma } from '../config/database';
import { encrypt } from '../utils/encryption';
import { signAccessToken } from '../utils/jwt';
import { NotFoundError, BadRequestError, ConflictError } from '../utils/errors';
import { userAuthMiddleware, requireUser } from '../middleware/auth';

export const subscriptionRouter = Router({ mergeParams: true });

const wrap = (fn: (req: Request, res: Response) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) => {
    fn(req, res).catch(next);
  };

/**
 * Determine plan tier from product id.
 * Product ids follow: {tier}_{period} e.g. pro_monthly, pro_yearly, pro_plus_monthly
 */
function tierFromProductId(productId: string): 'pro' | 'pro_plus' | null {
  if (productId.startsWith('pro_plus_')) return 'pro_plus';
  if (productId.startsWith('pro_')) return 'pro';
  return null;
}

/**
 * Start a free trial. User gets full Pro+ access for trialDays.
 * Idempotent: re-issuing does not reset the trial period.
 */
subscriptionRouter.post('/trial', userAuthMiddleware, requireUser, wrap(async (req, res) => {
  const data = StartTrialRequestSchema.parse(req.body);
  const ctx = req.appContext!;
  const user = ctx.appUser!;

  const appUser = await prisma.appUser.findUnique({ where: { id: user.id } });
  if (!appUser) throw new NotFoundError('User not found');

  if (appUser.trialEndsAt && appUser.trialEndsAt > new Date()) {
    // Already in active trial
    res.json({
      status: 'already_active',
      trialEndsAt: appUser.trialEndsAt.toISOString(),
      plan: 'pro_plus',
    });
    return;
  }

  if (appUser.plan !== 'free') {
    throw new ConflictError('Zaten aktif bir aboneliğiniz var');
  }

  const trialDays = ctx.application!.trialDays;
  const trialEndsAt = new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000);

  await prisma.appUser.update({
    where: { id: user.id },
    data: {
      trialEndsAt,
      // Don't change plan; trial just unlocks pro_plus access via effectiveTier logic
    },
  });

  res.json({
    status: 'started',
    trialEndsAt: trialEndsAt.toISOString(),
    trialDays,
    plan: 'pro_plus',
  });
}));

/**
 * Verify a receipt (Apple App Store / Google Play).
 *
 * NOTE: For production, integrate with:
 *   - Apple App Store Server API: https://developer.apple.com/documentation/appstoreserverapi
 *   - Google Play Developer API: https://developers.google.com/android-publisher
 *
 * This endpoint is a scaffolding. To activate, plug your App Store Shared Secret
 * and Google Service Account JSON into the relevant adapter.
 */
subscriptionRouter.post('/verify', userAuthMiddleware, requireUser, wrap(async (req, res) => {
  const data = VerifyReceiptRequestSchema.parse(req.body);
  const ctx = req.appContext!;
  const user = ctx.appUser!;

  const tier = tierFromProductId(data.productId);
  if (!tier) {
    throw new BadRequestError(`Unknown product id: ${data.productId}`);
  }

  // === Receipt verification stub ===
  // TODO: Call Apple/Google server APIs to validate the receipt.
  // For now, accept the receipt and create/renew the subscription record.
  // In production, you must verify:
  //   1. Receipt signature is valid
  //   2. Bundle ID matches this app
  //   3. Product ID is what we expect
  //   4. Subscription is not expired
  //   5. No fraud signals (rapid receipt reuse, etc.)
  const isValid = true; // REPLACE WITH REAL VERIFICATION
  if (!isValid) {
    throw new BadRequestError('Receipt verification failed');
  }

  // Compute expiry based on period
  const isYearly = data.productId.includes('yearly');
  const startsAt = new Date();
  const expiresAt = new Date(startsAt);
  if (isYearly) expiresAt.setFullYear(expiresAt.getFullYear() + 1);
  else expiresAt.setMonth(expiresAt.getMonth() + 1);

  const originalId = `sub_${Date.now()}_${user.externalUserId.slice(0, 8)}`;

  // Upsert subscription
  const sub = await prisma.subscription.upsert({
    where: { originalId },
    create: {
      appUserId: user.id,
      applicationId: ctx.application!.id,
      platform: data.platform,
      productId: data.productId,
      status: 'active',
      originalId,
      receiptCipher: encrypt(data.receipt),
      startsAt,
      expiresAt,
      environment: data.environment,
    },
    update: {
      status: 'active',
      expiresAt,
      receiptCipher: encrypt(data.receipt),
      productId: data.productId,
    },
  });

  // Upgrade user
  await prisma.appUser.update({
    where: { id: user.id },
    data: {
      plan: tier,
      isPremium: true,
      // Clear trial since user is now paying
      trialEndsAt: null,
    },
  });

  // Issue fresh access token with new plan
  const appUser = await prisma.appUser.findUnique({ where: { id: user.id } });
  const newAccessToken = signAccessToken({
    appUserId: user.id,
    applicationId: ctx.application!.id,
    externalUserId: user.externalUserId,
    email: appUser?.email ?? null,
    isPremium: true,
    plan: tier,
    trialEndsAt: null,
    dailyQuota: -1,
  });

  res.json({
    subscription: {
      id: sub.id,
      productId: sub.productId,
      status: sub.status,
      startsAt: sub.startsAt.toISOString(),
      expiresAt: sub.expiresAt.toISOString(),
      autoRenew: sub.autoRenew,
    },
    plan: tier,
    accessToken: newAccessToken,
  });
}));

/**
 * Cancel subscription. Keeps access until expiresAt.
 * Apple/Google auto-renew cancellation; we mark cancelledAt but keep isPremium true until expiry.
 */
subscriptionRouter.post('/cancel', userAuthMiddleware, requireUser, wrap(async (req, res) => {
  const data = CancelSubscriptionRequestSchema.parse(req.body);
  const ctx = req.appContext!;
  const user = ctx.appUser!;

  const sub = await prisma.subscription.findFirst({
    where: {
      appUserId: user.id,
      applicationId: ctx.application!.id,
      status: 'active',
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!sub) {
    throw new NotFoundError('No active subscription to cancel');
  }

  await prisma.subscription.update({
    where: { id: sub.id },
    data: {
      status: 'cancelled',
      cancelledAt: new Date(),
      autoRenew: false,
    },
  });

  // AppUser.plan stays at the same tier until expiresAt. We track this in middleware.
  res.json({
    status: 'cancelled',
    expiresAt: sub.expiresAt.toISOString(),
    accessUntil: sub.expiresAt.toISOString(),
  });
}));

/**
 * Get current subscription status.
 */
subscriptionRouter.get('/status', userAuthMiddleware, requireUser, wrap(async (req, res) => {
  const ctx = req.appContext!;
  const user = ctx.appUser!;

  const appUser = await prisma.appUser.findUnique({ where: { id: user.id } });
  const sub = await prisma.subscription.findFirst({
    where: {
      appUserId: user.id,
      applicationId: ctx.application!.id,
    },
    orderBy: { createdAt: 'desc' },
  });

  const now = new Date();
  const isInTrial = !!(appUser?.trialEndsAt && appUser.trialEndsAt > now);

  res.json({
    plan: appUser?.plan ?? 'free',
    isPremium: appUser?.isPremium ?? false,
    isInTrial,
    trialEndsAt: appUser?.trialEndsAt?.toISOString() ?? null,
    subscription: sub ? {
      id: sub.id,
      productId: sub.productId,
      status: sub.status,
      startsAt: sub.startsAt.toISOString(),
      expiresAt: sub.expiresAt.toISOString(),
      autoRenew: sub.autoRenew,
      cancelledAt: sub.cancelledAt?.toISOString() ?? null,
    } : null,
  });
}));

/**
 * Public endpoint: get app's plan catalog (no auth, public pricing).
 * Used by iOS paywall screen to render 3-tier pricing.
 */
subscriptionRouter.get('/catalog', wrap(async (req, res) => {
  const ctx = req.appContext!;

  res.json({
    trialDays: ctx.application!.trialDays,
    currency: 'USD',
    plans: [
      {
        tier: 'free',
        displayName: 'Ücretsiz',
        tagline: 'Başlamak için ideal',
        priceMonthlyCents: 0,
        priceYearlyCents: 0,
        dailyAiQuota: ctx.application!.freeQuotaPerDay,
        features: [
          `${ctx.application!.freeQuotaPerDay} AI tarama / gün`,
          'Temel makro takibi',
          'Su tüketimi',
          '7 günlük geçmiş',
        ],
        perks: {
          unlimitedAi: false,
          multiAiEnsemble: false,
          clinicalAlarms: false,
          cloudSync: false,
          pdfReports: false,
          dietitianMode: false,
          prioritySupport: false,
          pushNotifications: false,
          unlimitedHistory: false,
          advancedTrends: false,
        },
      },
      {
        tier: 'pro',
        displayName: 'Pro',
        tagline: 'Ciddi sağlık takibi için',
        priceMonthlyCents: ctx.application!.priceMonthlyCents,
        priceYearlyCents: ctx.application!.priceYearlyCents,
        dailyAiQuota: ctx.application!.proQuotaPerDay,
        features: [
          'Sınırsız AI tarama',
          'Multi-AI ensemble doğruluk',
          'Klinik hedef alarmları',
          'Bulut senkronizasyon',
          'PDF diyetisyen raporları',
          'Sınırsız geçmiş',
        ],
        perks: {
          unlimitedAi: true,
          multiAiEnsemble: true,
          clinicalAlarms: true,
          cloudSync: true,
          pdfReports: true,
          dietitianMode: false,
          prioritySupport: false,
          pushNotifications: false,
          unlimitedHistory: true,
          advancedTrends: false,
        },
        isPopular: true,
      },
      {
        tier: 'pro_plus',
        displayName: 'Pro+',
        tagline: 'Profesyoneller ve sağlık koçları için',
        priceMonthlyCents: ctx.application!.priceProPlusMonthlyCents,
        priceYearlyCents: ctx.application!.priceProPlusYearlyCents,
        dailyAiQuota: -1, // unlimited
        features: [
          'Pro\'nun tüm özellikleri',
          'Diyetisyen modu',
          'Öncelikli AI işleme',
          'Push bildirimler',
          'Gelişmiş 90 günlük trendler',
          'Öncelikli destek',
        ],
        perks: {
          unlimitedAi: true,
          multiAiEnsemble: true,
          clinicalAlarms: true,
          cloudSync: true,
          pdfReports: true,
          dietitianMode: true,
          prioritySupport: true,
          pushNotifications: true,
          unlimitedHistory: true,
          advancedTrends: true,
        },
      },
    ],
    trial: {
      days: ctx.application!.trialDays,
      productId: 'pro_plus_trial',
      description: `${ctx.application!.trialDays} gün boyunca tüm Pro+ özelliklerini ücretsiz dene. İstediğin zaman iptal et.`,
    },
  });
}));
