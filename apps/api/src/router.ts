import { Router, type Request, type Response, type NextFunction } from 'express';
import { appAuthMiddleware } from './middleware/auth';
import { authRouter } from './routes/app.auth';
import { aiRouter } from './routes/app.ai';
import { syncRouter, profileRouter } from './routes/app.sync';
import { subscriptionRouter } from './routes/app.subscription';
import { adminAuthRouter, adminRouter } from './routes/admin';
import { prisma } from './config/database';

export const v1Router = Router();

const wrap = (fn: (req: Request, res: Response) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) => {
    fn(req, res).catch(next);
  };

// ====== Health check (no auth) ======
v1Router.get('/health', wrap(async (_req, res) => {
  let dbOk = false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbOk = true;
  } catch {
    dbOk = false;
  }
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    database: dbOk ? 'connected' : 'disconnected',
  });
}));

// ====== Public health endpoint at root ======
export const healthRouter = Router();
healthRouter.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ====== Admin auth (no app key needed) ======
v1Router.use('/admin/auth', adminAuthRouter);

// ====== Admin (requires admin JWT) ======
v1Router.use('/admin', adminRouter);

// ====== App routes ======
// All /v1/apps/:appSlug/* routes require X-Api-Key header
v1Router.use('/apps/:appSlug/auth', appAuthMiddleware, authRouter);
v1Router.use('/apps/:appSlug/ai', appAuthMiddleware, aiRouter);
v1Router.use('/apps/:appSlug/sync', appAuthMiddleware, syncRouter);
v1Router.use('/apps/:appSlug/profile', appAuthMiddleware, profileRouter);
v1Router.use('/apps/:appSlug/subscription', appAuthMiddleware, subscriptionRouter);
