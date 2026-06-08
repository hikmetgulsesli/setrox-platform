import winston from 'winston';
import { env } from './env';

const isDev = env.NODE_ENV === 'development';

export const logger = winston.createLogger({
  level: isDev ? 'debug' : 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    isDev
      ? winston.format.printf(({ timestamp, level, message, ...meta }) => {
          const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
          return `${timestamp} [${level.toUpperCase()}] ${message}${metaStr}`;
        })
      : winston.format.json(),
  ),
  transports: [
    new winston.transports.Console({
      stderrLevels: ['error'],
    }),
  ],
  // Don't crash on uncaught
  exitOnError: false,
});

if (!isDev) {
  // In production we'd add file transports or ship to a log service
  // (e.g. Sentry, Logtail, Loki, etc.)
}
