import type { NextFunction, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { env } from '../config/env';
import { TooManyRequestsError } from '../utils/errors';

export const globalRateLimit = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, _res, next) => {
    next(new TooManyRequestsError());
  },
});

// Stricter rate limit for AI endpoints (cost control)
export const aiRateLimit = rateLimit({
  windowMs: 60_000, // 1 minute
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, _res, next) => {
    next(new TooManyRequestsError('AI rate limit exceeded. Try again in a minute.'));
  },
});

export const authRateLimit = rateLimit({
  windowMs: 15 * 60_000, // 15 minutes
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, _res, next) => {
    next(new TooManyRequestsError('Too many auth attempts. Try again later.'));
  },
});

// Request logger
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    // Lightweight in-line log; full logger in error middleware
    if (duration > 1000 || res.statusCode >= 400) {
      // eslint-disable-next-line no-console
      console.log(`${req.method} ${req.path} ${res.statusCode} (${duration}ms)`);
    }
  });
  next();
}
