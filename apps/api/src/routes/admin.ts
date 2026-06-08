import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma, Prisma } from '../config/database';
import { signAdminToken } from '../utils/jwt';
import { encrypt, decrypt } from '../utils/encryption';
import { BadRequestError, NotFoundError, UnauthorizedError, ConflictError } from '../utils/errors';
import { adminAuthMiddleware, requireAdmin } from '../middleware/auth';

export const adminRouter = Router();
export const adminAuthRouter = Router();

const wrap = (fn: (req: Request, res: Response) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) => {
    fn(req, res).catch(next);
  };

// ====== AUTH ======

adminAuthRouter.post('/login', wrap(async (req, res) => {
  const data = z.object({ email: z.string().email(), password: z.string() }).parse(req.body);
  const admin = await prisma.adminUser.findUnique({ where: { email: data.email } });
  if (!admin || !admin.isActive) throw new UnauthorizedError('Invalid credentials');

  const valid = await bcrypt.compare(data.password, admin.passwordHash);
  if (!valid) throw new UnauthorizedError('Invalid credentials');

  await prisma.adminUser.update({
    where: { id: admin.id },
    data: { lastLoginAt: new Date() },
  });

  const token = signAdminToken({
    adminId: admin.id,
    email: admin.email,
    role: admin.role,
  });

  res.json({
    token,
    admin: {
      id: admin.id,
      email: admin.email,
      name: admin.name,
      role: admin.role,
    },
  });
}));

adminAuthRouter.get('/me', adminAuthMiddleware, wrap(async (req, res) => {
  const admin = await prisma.adminUser.findUnique({
    where: { id: req.appContext!.adminUser!.id },
  });
  if (!admin) throw new NotFoundError('Admin not found');
  res.json({
    admin: { id: admin.id, email: admin.email, name: admin.name, role: admin.role },
  });
}));

// ====== PROVIDERS ======

adminRouter.get('/providers', adminAuthMiddleware, wrap(async (_req, res) => {
  const providers = await prisma.aIProvider.findMany({
    orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
  });
  res.json({
    providers: providers.map((p) => ({
      id: p.id,
      slug: p.slug,
      displayName: p.displayName,
      type: p.type,
      isEnabled: p.isEnabled,
      priority: p.priority,
      costPer1kInput: Number(p.costPer1kInput),
      costPer1kOutput: Number(p.costPer1kOutput),
      notes: p.notes,
      hasApiKey: !!p.apiKeyCipher,
      baseUrl: p.baseUrl,
      config: p.config,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    })),
  });
}));

adminRouter.post('/providers', adminAuthMiddleware, requireAdmin, wrap(async (req, res) => {
  const data = z.object({
    slug: z.string().min(2).max(64).regex(/^[a-z0-9-]+$/),
    displayName: z.string().min(2).max(128),
    type: z.enum(['vision', 'text', 'both']),
    apiKey: z.string().min(1),
    baseUrl: z.string().url().optional(),
    priority: z.number().int().min(0).max(1000).default(100),
    costPer1kInput: z.number().min(0).default(0),
    costPer1kOutput: z.number().min(0).default(0),
    config: z.record(z.unknown()).optional(),
    notes: z.string().optional(),
  }).parse(req.body);

  const existing = await prisma.aIProvider.findUnique({ where: { slug: data.slug } });
  if (existing) throw new ConflictError(`Provider with slug "${data.slug}" already exists`);

  const provider = await prisma.aIProvider.create({
    data: {
      slug: data.slug,
      displayName: data.displayName,
      type: data.type,
      apiKeyCipher: encrypt(data.apiKey),
      baseUrl: data.baseUrl,
      priority: data.priority,
      costPer1kInput: data.costPer1kInput,
      costPer1kOutput: data.costPer1kOutput,
      config: (data.config as Prisma.InputJsonValue | undefined) ?? Prisma.JsonNull,
      notes: data.notes,
    },
  });

  await prisma.adminAuditLog.create({
    data: {
      adminId: req.appContext!.adminUser!.id,
      action: 'provider.create',
      target: provider.id,
      details: { slug: provider.slug, displayName: provider.displayName } as Prisma.InputJsonValue,
      ip: req.ip,
    },
  });

  res.status(201).json({ provider: { id: provider.id, slug: provider.slug } });
}));

adminRouter.patch('/providers/:id', adminAuthMiddleware, requireAdmin, wrap(async (req, res) => {
  const data = z.object({
    displayName: z.string().optional(),
    apiKey: z.string().optional(),
    baseUrl: z.string().url().optional().nullable(),
    isEnabled: z.boolean().optional(),
    priority: z.number().int().min(0).max(1000).optional(),
    costPer1kInput: z.number().min(0).optional(),
    costPer1kOutput: z.number().min(0).optional(),
    config: z.record(z.unknown()).optional(),
    notes: z.string().optional(),
  }).parse(req.body);

  const updateData: Record<string, unknown> = {};
  if (data.displayName !== undefined) updateData.displayName = data.displayName;
  if (data.apiKey !== undefined) updateData.apiKeyCipher = encrypt(data.apiKey);
  if (data.baseUrl !== undefined) updateData.baseUrl = data.baseUrl;
  if (data.isEnabled !== undefined) updateData.isEnabled = data.isEnabled;
  if (data.priority !== undefined) updateData.priority = data.priority;
  if (data.costPer1kInput !== undefined) updateData.costPer1kInput = data.costPer1kInput;
  if (data.costPer1kOutput !== undefined) updateData.costPer1kOutput = data.costPer1kOutput;
  if (data.config !== undefined) updateData.config = data.config as Prisma.InputJsonValue;
  if (data.notes !== undefined) updateData.notes = data.notes;

  const provider = await prisma.aIProvider.update({
    where: { id: req.params.id ?? '' },
    data: updateData,
  });

  await prisma.adminAuditLog.create({
    data: {
      adminId: req.appContext!.adminUser!.id,
      action: 'provider.update',
      target: provider.id,
      details: data as Prisma.InputJsonValue,
      ip: req.ip,
    },
  });

  res.json({ success: true });
}));

adminRouter.post('/providers/:id/toggle', adminAuthMiddleware, requireAdmin, wrap(async (req, res) => {
  const provider = await prisma.aIProvider.findUnique({ where: { id: req.params.id ?? '' } });
  if (!provider) throw new NotFoundError('Provider not found');

  const updated = await prisma.aIProvider.update({
    where: { id: provider.id },
    data: { isEnabled: !provider.isEnabled },
  });

  await prisma.adminAuditLog.create({
    data: {
      adminId: req.appContext!.adminUser!.id,
      action: updated.isEnabled ? 'provider.enable' : 'provider.disable',
      target: provider.id,
      ip: req.ip,
    },
  });

  res.json({ isEnabled: updated.isEnabled });
}));

adminRouter.post('/providers/:id/test', adminAuthMiddleware, requireAdmin, wrap(async (req, res) => {
  const provider = await prisma.aIProvider.findUnique({ where: { id: req.params.id ?? '' } });
  if (!provider) throw new NotFoundError('Provider not found');
  if (!provider.isEnabled) throw new BadRequestError('Provider is disabled');

  const apiKey = decrypt(provider.apiKeyCipher);
  const config = provider.config as Record<string, unknown> | null;

  let success = false;
  let message = 'Test not implemented';

  try {
    const { GeminiAdapter, KimiAdapter, MiniMaxAdapter } = await import('../services/ai/index.js');
    let adapter;
    switch (provider.slug) {
      case 'gemini-flash':
      case 'gemini-pro':
        adapter = new GeminiAdapter(apiKey, (config?.model as string) ?? 'gemini-2.0-flash');
        break;
      case 'kimi':
        adapter = new KimiAdapter(apiKey, (config?.baseUrl as string) ?? undefined, (config?.model as string) ?? 'kimi-k2');
        break;
      case 'minimax':
        adapter = new MiniMaxAdapter(apiKey, (config?.baseUrl as string) ?? undefined, (config?.model as string) ?? 'MiniMax-M2');
        break;
      default:
        message = `Unknown provider slug: ${provider.slug}`;
    }
    if (adapter) {
      success = await adapter.testConnection();
      message = success ? 'Connection successful' : 'Provider returned non-OK status';
    }
  } catch (err) {
    message = (err as Error).message;
  }

  res.json({ success, message });
}));

// ====== APPLICATIONS ======

adminRouter.get('/applications', adminAuthMiddleware, wrap(async (_req, res) => {
  const apps = await prisma.application.findMany({
    include: {
      _count: { select: { users: true, usageLogs: true } },
    },
    orderBy: { createdAt: 'asc' },
  });
  res.json({
    applications: apps.map((a) => ({
      id: a.id,
      slug: a.slug,
      name: a.name,
      description: a.description,
      isActive: a.isActive,
      freeQuotaPerDay: a.freeQuotaPerDay,
      totalUsers: a._count.users,
      totalRequests: a._count.usageLogs,
      createdAt: a.createdAt,
    })),
  });
}));

adminRouter.post('/applications', adminAuthMiddleware, requireAdmin, wrap(async (req, res) => {
  const data = z.object({
    slug: z.string().min(2).max(64).regex(/^[a-z0-9-]+$/),
    name: z.string().min(2).max(128),
    description: z.string().optional(),
    freeQuotaPerDay: z.number().int().min(0).max(10000).default(5),
  }).parse(req.body);

  const existing = await prisma.application.findUnique({ where: { slug: data.slug } });
  if (existing) throw new ConflictError(`App with slug "${data.slug}" already exists`);

  // Generate API key
  const apiKey = `app_${crypto.randomUUID().replace(/-/g, '')}`;

  const app = await prisma.application.create({
    data: {
      slug: data.slug,
      name: data.name,
      description: data.description,
      apiKey,
      freeQuotaPerDay: data.freeQuotaPerDay,
    },
  });

  await prisma.adminAuditLog.create({
    data: {
      adminId: req.appContext!.adminUser!.id,
      action: 'application.create',
      target: app.id,
      details: { slug: app.slug, name: app.name } as Prisma.InputJsonValue,
      ip: req.ip,
    },
  });

  res.status(201).json({ application: { id: app.id, slug: app.slug, apiKey } });
}));

adminRouter.patch('/applications/:id', adminAuthMiddleware, requireAdmin, wrap(async (req, res) => {
  const data = z.object({
    name: z.string().optional(),
    description: z.string().optional(),
    isActive: z.boolean().optional(),
    freeQuotaPerDay: z.number().int().min(0).max(10000).optional(),
    proQuotaPerDay: z.number().int().min(0).max(100000).optional(),
    priceMonthlyCents: z.number().int().min(0).max(99999).optional(),
    priceYearlyCents: z.number().int().min(0).max(999999).optional(),
    priceProPlusMonthlyCents: z.number().int().min(0).max(99999).optional(),
    priceProPlusYearlyCents: z.number().int().min(0).max(999999).optional(),
    trialDays: z.number().int().min(0).max(60).optional(),
  }).parse(req.body);

  await prisma.application.update({
    where: { id: req.params.id ?? '' },
    data,
  });
  res.json({ success: true });
}));

adminRouter.post('/applications/:id/regenerate-key', adminAuthMiddleware, requireAdmin, wrap(async (req, res) => {
  const newKey = `app_${crypto.randomUUID().replace(/-/g, '')}`;
  const app = await prisma.application.update({
    where: { id: req.params.id ?? '' },
    data: { apiKey: newKey },
  });
  await prisma.adminAuditLog.create({
    data: {
      adminId: req.appContext!.adminUser!.id,
      action: 'application.regenerate_key',
      target: app.id,
      ip: req.ip,
    },
  });
  res.json({ apiKey: newKey });
}));

// ====== ANALYTICS ======

adminRouter.get('/usage', adminAuthMiddleware, wrap(async (req, res) => {
  const from = (req.query.from as string)
    ? new Date(req.query.from as string)
    : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const to = (req.query.to as string) ? new Date(req.query.to as string) : new Date();
  const appId = req.query.appId as string | undefined;
  const providerId = req.query.providerId as string | undefined;

  const where = {
    createdAt: { gte: from, lte: to },
    ...(appId && { applicationId: appId }),
    ...(providerId && { providerId }),
  };

  const [totals, byProvider, byApp, byDay] = await Promise.all([
    prisma.aIUsageLog.aggregate({
      where,
      _count: { _all: true },
      _sum: { costUsd: true, inputTokens: true, outputTokens: true },
      _avg: { latencyMs: true },
    }),
    prisma.aIUsageLog.groupBy({
      where,
      by: ['providerId'],
      _count: { _all: true },
      _sum: { costUsd: true },
    }),
    prisma.aIUsageLog.groupBy({
      where,
      by: ['applicationId'],
      _count: { _all: true },
      _sum: { costUsd: true },
    }),
    prisma.$queryRaw<Array<{date: string; requests: bigint; cost: number}>>`
      SELECT DATE("createdAt") as date, COUNT(*) as requests, COALESCE(SUM("costUsd"), 0) as cost
      FROM "AIUsageLog"
      WHERE "createdAt" >= ${from} AND "createdAt" <= ${to}
        ${appId ? Prisma.sql`AND "applicationId" = ${appId}` : Prisma.empty}
        ${providerId ? Prisma.sql`AND "providerId" = ${providerId}` : Prisma.empty}
      GROUP BY DATE("createdAt")
      ORDER BY date ASC
    `.catch(() => []),
  ]);

  // Hydrate provider names
  const providerIds = byProvider.map((x) => x.providerId);
  const providers = await prisma.aIProvider.findMany({ where: { id: { in: providerIds } } });
  const providerMap = new Map(providers.map((p) => [p.id, p]));

  const appIds = byApp.map((x) => x.applicationId);
  const apps = await prisma.application.findMany({ where: { id: { in: appIds } } });
  const appMap = new Map(apps.map((a) => [a.id, a]));

  res.json({
    totals: {
      requests: totals._count._all,
      cost: Number(totals._sum.costUsd ?? 0),
      inputTokens: totals._sum.inputTokens ?? 0,
      outputTokens: totals._sum.outputTokens ?? 0,
      avgLatencyMs: Math.round(totals._avg.latencyMs ?? 0),
    },
    byProvider: byProvider.map((x) => ({
      providerId: x.providerId,
      providerName: providerMap.get(x.providerId)?.displayName ?? 'Unknown',
      providerSlug: providerMap.get(x.providerId)?.slug ?? 'unknown',
      requests: x._count._all,
      cost: Number(x._sum.costUsd ?? 0),
    })),
    byApp: byApp.map((x) => ({
      appId: x.applicationId,
      appName: appMap.get(x.applicationId)?.name ?? 'Unknown',
      appSlug: appMap.get(x.applicationId)?.slug ?? 'unknown',
      requests: x._count._all,
      cost: Number(x._sum.costUsd ?? 0),
    })),
    byDay: byDay.map((d) => ({
      date: d.date,
      requests: Number(d.requests),
      cost: Number(d.cost),
    })),
  });
}));

adminRouter.get('/users', adminAuthMiddleware, wrap(async (req, res) => {
  const appId = req.query.appId as string | undefined;
  const search = (req.query.search as string) ?? '';
  const limit = Math.min(Number(req.query.limit ?? 50), 200);

  const where = {
    ...(appId && { applicationId: appId }),
    ...(search && {
      OR: [
        { email: { contains: search, mode: 'insensitive' as const } },
        { externalUserId: { contains: search, mode: 'insensitive' as const } },
      ],
    }),
  };

  const users = await prisma.appUser.findMany({
    where,
    take: limit,
    orderBy: { createdAt: 'desc' },
    include: { application: true },
  });

  res.json({
    users: users.map((u) => ({
      id: u.id,
      externalUserId: u.externalUserId,
      email: u.email,
      displayName: u.displayName,
      isPremium: u.isPremium,
      appSlug: u.application.slug,
      appName: u.application.name,
      lastSeenAt: u.lastSeenAt,
      createdAt: u.createdAt,
    })),
  });
}));
