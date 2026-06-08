import { Router, type Request, type Response, type NextFunction } from 'express';
import { LogSyncRequestSchema, HydrationSyncRequestSchema, ProfileUpdateRequestSchema } from '@setrox/shared/schemas';
import { prisma, Prisma } from '../config/database';
import { BadRequestError, NotFoundError } from '../utils/errors';
import { userAuthMiddleware, requireUser } from '../middleware/auth';

export const syncRouter = Router({ mergeParams: true });
export const profileRouter = Router({ mergeParams: true });

const wrap = (fn: (req: Request, res: Response) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) => {
    fn(req, res).catch(next);
  };

// ====== LOG SYNC ======

syncRouter.post('/logs', userAuthMiddleware, requireUser, wrap(async (req, res) => {
  const data = LogSyncRequestSchema.parse(req.body);
  const ctx = req.appContext!;
  const user = ctx.appUser!;

  const results = [];
  for (const entry of data.entries) {
    if (entry.deleted) {
      await prisma.log.deleteMany({
        where: { id: entry.id, appUserId: user.id },
      });
      results.push({ id: entry.id, status: 'deleted' });
    } else {
      // Upsert by id (client-generated UUID)
      const stored = await prisma.log.upsert({
        where: { id: entry.id },
        create: {
          id: entry.id,
          appUserId: user.id,
          applicationId: ctx.application!.id,
          dateKey: entry.dateKey,
          mealCategory: entry.mealCategory,
          items: entry.items,
          smartInsight: entry.smartInsight,
          imageUris: entry.imageUris ?? [],
          totalCalories: entry.totalCalories,
          totalProtein: entry.totalProtein,
          totalCarbs: entry.totalCarbs,
          totalFat: entry.totalFat,
        },
        update: {
          dateKey: entry.dateKey,
          mealCategory: entry.mealCategory,
          items: entry.items,
          smartInsight: entry.smartInsight,
          imageUris: entry.imageUris ?? [],
          totalCalories: entry.totalCalories,
          totalProtein: entry.totalProtein,
          totalCarbs: entry.totalCarbs,
          totalFat: entry.totalFat,
        },
      });
      results.push({ id: stored.id, status: 'synced' });
    }
  }

  res.json({ results, syncedAt: new Date().toISOString() });
}));

syncRouter.get('/logs', userAuthMiddleware, requireUser, wrap(async (req, res) => {
  const ctx = req.appContext!;
  const user = ctx.appUser!;
  const from = (req.query.from as string) ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const to = (req.query.to as string) ?? new Date().toISOString().split('T')[0];

  const logs = await prisma.log.findMany({
    where: {
      appUserId: user.id,
      dateKey: { gte: from, lte: to },
    },
    orderBy: { createdAt: 'asc' },
  });

  res.json({ logs, syncedAt: new Date().toISOString() });
}));

// ====== HYDRATION SYNC ======

syncRouter.post('/hydration', userAuthMiddleware, requireUser, wrap(async (req, res) => {
  const data = HydrationSyncRequestSchema.parse(req.body);
  const ctx = req.appContext!;
  const user = ctx.appUser!;

  const results = [];
  for (const day of data.days) {
    const stored = await prisma.hydrationDay.upsert({
      where: { appUserId_dateKey: { appUserId: user.id, dateKey: day.dateKey } },
      create: {
        appUserId: user.id,
        applicationId: ctx.application!.id,
        dateKey: day.dateKey,
        amountMl: day.amountMl,
      },
      update: { amountMl: day.amountMl },
    });
    results.push({ dateKey: stored.dateKey, amountMl: stored.amountMl });
  }

  res.json({ results, syncedAt: new Date().toISOString() });
}));

syncRouter.get('/hydration', userAuthMiddleware, requireUser, wrap(async (req, res) => {
  const ctx = req.appContext!;
  const user = ctx.appUser!;
  const from = (req.query.from as string) ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const to = (req.query.to as string) ?? new Date().toISOString().split('T')[0];

  const days = await prisma.hydrationDay.findMany({
    where: {
      appUserId: user.id,
      dateKey: { gte: from, lte: to },
    },
    orderBy: { dateKey: 'asc' },
  });

  res.json({ days, syncedAt: new Date().toISOString() });
}));

// ====== PROFILE ======

profileRouter.get('/me', userAuthMiddleware, requireUser, wrap(async (req, res) => {
  const user = req.appContext!.appUser!;
  const profile = await prisma.appUser.findUnique({
    where: { id: user.id },
  });
  if (!profile) throw new NotFoundError('Profile not found');

  const metadata = (profile.metadata as Record<string, unknown> | null) ?? {};
  res.json({
    profile: {
      id: profile.externalUserId,
      email: profile.email,
      displayName: profile.displayName,
      isPremium: profile.isPremium,
      plan: profile.plan,
      trialEndsAt: profile.trialEndsAt?.toISOString() ?? null,
      healthGoal: metadata.healthGoal ?? null,
      goals: metadata.goals ?? null,
      age: metadata.age ?? null,
      height: metadata.height ?? null,
      weight: metadata.weight ?? null,
      gender: metadata.gender ?? null,
      unitSystem: metadata.unitSystem ?? 'metric',
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt,
    },
  });
}));

profileRouter.patch('/me', userAuthMiddleware, requireUser, wrap(async (req, res) => {
  const data = ProfileUpdateRequestSchema.parse(req.body);
  const user = req.appContext!.appUser!;

  // Merge with existing metadata
  const existing = await prisma.appUser.findUnique({ where: { id: user.id } });
  if (!existing) throw new NotFoundError('User not found');
  const currentMetadata = (existing.metadata as Record<string, unknown> | null) ?? {};

  const newMetadata = {
    ...currentMetadata,
    ...(data.healthGoal !== undefined && { healthGoal: data.healthGoal }),
    ...(data.goals && { goals: { ...((currentMetadata.goals as Record<string, unknown>) ?? {}), ...data.goals } }),
    ...(data.age !== undefined && { age: data.age }),
    ...(data.height !== undefined && { height: data.height }),
    ...(data.weight !== undefined && { weight: data.weight }),
    ...(data.gender !== undefined && { gender: data.gender }),
    ...(data.unitSystem && { unitSystem: data.unitSystem }),
  };

  const updated = await prisma.appUser.update({
    where: { id: user.id },
    data: {
      displayName: data.displayName,
      metadata: newMetadata as Prisma.InputJsonValue,
    },
  });

  res.json({
    profile: {
      id: updated.externalUserId,
      email: updated.email,
      displayName: updated.displayName,
      isPremium: updated.isPremium,
      plan: updated.plan,
      healthGoal: newMetadata.healthGoal ?? null,
      goals: newMetadata.goals ?? null,
      age: newMetadata.age ?? null,
      height: newMetadata.height ?? null,
      weight: newMetadata.weight ?? null,
      gender: newMetadata.gender ?? null,
      unitSystem: newMetadata.unitSystem ?? 'metric',
      updatedAt: updated.updatedAt,
    },
  });
}));

profileRouter.delete('/me', userAuthMiddleware, requireUser, wrap(async (req, res) => {
  const user = req.appContext!.appUser!;
  await prisma.appUser.delete({ where: { id: user.id } });
  res.status(204).end();
}));
