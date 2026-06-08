import { Router, type Request, type Response, type NextFunction } from 'express';
import {
  AIAnalyzeImageRequestSchema,
  AIAnalyzeTextRequestSchema,
} from '@setrox/shared/schemas';
import { AIOrchestrator, AIProviderError } from '../services/ai/index';
import { prisma } from '../config/database';
import { BadRequestError, NotFoundError, TooManyRequestsError, UnauthorizedError, ForbiddenError } from '../utils/errors';
import { userAuthMiddleware, requireUser } from '../middleware/auth';
import { aiRateLimit } from '../middleware/rateLimit';

export const aiRouter = Router({ mergeParams: true });

const wrap = (fn: (req: Request, res: Response) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) => {
    fn(req, res).catch(next);
  };

/**
 * Tier-aware quota check.
 * - free:    application.freeQuotaPerDay (default 3)
 * - pro:     application.proQuotaPerDay (default 100, soft cap)
 * - pro_plus: unlimited (-1)
 *
 * Active trial is treated as pro_plus (full access).
 */
async function checkDailyQuota(
  applicationId: string,
  appUserId: string,
  plan: string,
  trialEndsAt: Date | null,
  freeQuotaPerDay: number,
  proQuotaPerDay: number,
): Promise<void> {
  // Determine effective tier
  const now = new Date();
  const isInTrial = trialEndsAt && trialEndsAt > now;
  const effectiveTier = isInTrial ? 'pro_plus' : plan;

  // pro_plus = unlimited
  if (effectiveTier === 'pro_plus') return;

  const limit = effectiveTier === 'pro' ? proQuotaPerDay : freeQuotaPerDay;
  if (limit < 0) return; // unlimited explicitly

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const usage = await prisma.aIUsageLog.count({
    where: {
      applicationId,
      appUserId,
      type: 'image',
      success: true,
      createdAt: { gte: today },
    },
  });
  if (usage >= limit) {
    const upgradeMsg = effectiveTier === 'free'
      ? `Günlük ücretsiz ${limit} analiz hakkınız doldu. Pro'ya geçerek sınırsız analiz yapabilirsiniz!`
      : `Günlük Pro limitiniz (${limit}) doldu. Pro+ ile sınırsız analiz yapabilirsiniz!`;
    throw new TooManyRequestsError(upgradeMsg);
  }
}

aiRouter.post(
  '/analyze-image',
  userAuthMiddleware,
  requireUser,
  aiRateLimit,
  wrap(async (req, res) => {
    const data = AIAnalyzeImageRequestSchema.parse(req.body);
    const ctx = req.appContext!;
    const user = ctx.appUser!;

    if (!ctx.application!.isActive) {
      throw new ForbiddenError('App is disabled');
    }

    // Tier-aware quota check (free: 3, pro: 100, pro_plus: unlimited)
    if (!user.isPremium) {
      const appUser = await prisma.appUser.findUnique({ where: { id: user.id } });
      await checkDailyQuota(
        ctx.application!.id,
        user.id,
        user.plan,
        appUser?.trialEndsAt ?? null,
        ctx.application!.freeQuotaPerDay,
        ctx.application!.proQuotaPerDay,
      );
    }

    const orchestrator = new AIOrchestrator();
    await orchestrator.loadProviders(ctx.application!.id);

    const result = await orchestrator.analyze(
      {
        imageBase64: data.imageBase64,
        imageMimeType: data.mimeType,
        mealCategory: data.mealCategory,
        healthGoal: data.healthGoal,
      },
      {
        applicationId: ctx.application!.id,
        appUserId: user.id,
        requestType: 'image',
      },
    );

    res.json({
      success: true,
      provider: result.providerSlug,
      items: result.items,
      mealCategory: result.mealCategory,
      smartInsight: result.smartInsight,
      model: result.model,
      latencyMs: result.latencyMs,
    });
  }),
);

aiRouter.post(
  '/analyze-text',
  userAuthMiddleware,
  requireUser,
  aiRateLimit,
  wrap(async (req, res) => {
    const data = AIAnalyzeTextRequestSchema.parse(req.body);
    const ctx = req.appContext!;
    const user = ctx.appUser!;

    if (!ctx.application!.isActive) {
      throw new ForbiddenError('App is disabled');
    }

    if (!user.isPremium) {
      const appUser = await prisma.appUser.findUnique({ where: { id: user.id } });
      await checkDailyQuota(
        ctx.application!.id,
        user.id,
        user.plan,
        appUser?.trialEndsAt ?? null,
        ctx.application!.freeQuotaPerDay,
        ctx.application!.proQuotaPerDay,
      );
    }

    const orchestrator = new AIOrchestrator();
    await orchestrator.loadProviders(ctx.application!.id);

    const result = await orchestrator.analyze(
      {
        text: data.text,
        mealCategory: data.mealCategory,
        healthGoal: data.healthGoal,
      },
      {
        applicationId: ctx.application!.id,
        appUserId: user.id,
        requestType: 'text',
      },
    );

    res.json({
      success: true,
      provider: result.providerSlug,
      items: result.items,
      mealCategory: result.mealCategory,
      smartInsight: result.smartInsight,
      model: result.model,
      latencyMs: result.latencyMs,
    });
  }),
);

aiRouter.get(
  '/quota',
  userAuthMiddleware,
  requireUser,
  wrap(async (req, res) => {
    const ctx = req.appContext!;
    const user = ctx.appUser!;

    // Need actual DB record for plan + trialEndsAt
    const appUser = await prisma.appUser.findUnique({ where: { id: user.id } });
    const now = new Date();
    const isInTrial = !!(appUser?.trialEndsAt && appUser.trialEndsAt > now);
    const effectiveTier = isInTrial ? 'pro_plus' : (appUser?.plan ?? 'free');

    // Unlimited for pro_plus (and active trial)
    if (effectiveTier === 'pro_plus') {
      res.json({
        plan: effectiveTier,
        isPremium: true,
        isInTrial,
        trialEndsAt: appUser?.trialEndsAt?.toISOString() ?? null,
        dailyLimit: -1,
        usedToday: 0,
        remainingToday: -1,
      });
      return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const used = await prisma.aIUsageLog.count({
      where: {
        applicationId: ctx.application!.id,
        appUserId: user.id,
        success: true,
        createdAt: { gte: today },
      },
    });

    const limit = effectiveTier === 'pro'
      ? ctx.application!.proQuotaPerDay
      : ctx.application!.freeQuotaPerDay;

    res.json({
      plan: effectiveTier,
      isPremium: user.isPremium,
      isInTrial: false,
      trialEndsAt: null,
      dailyLimit: limit,
      usedToday: used,
      remainingToday: Math.max(0, limit - used),
    });
  }),
);
