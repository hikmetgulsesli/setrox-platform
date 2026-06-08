import { PrismaClient, Prisma } from '@prisma/client';
import { env } from './env';
import { logger } from './logger';

export { Prisma };

export const prisma = new PrismaClient({
  log: env.NODE_ENV === 'development'
    ? [{ level: 'query', emit: 'event' }, { level: 'error', emit: 'event' }, { level: 'warn', emit: 'event' }]
    : [{ level: 'error', emit: 'event' }],
});

prisma.$on('error', (e) => {
  logger.error('Prisma error', { message: e.message });
});

if (env.NODE_ENV === 'development') {
  prisma.$on('query', (e) => {
    logger.debug(`Prisma query: ${e.query} (${e.duration}ms)`);
  });
}

export async function connectDatabase(): Promise<void> {
  try {
    await prisma.$connect();
    logger.info('✅ Database connected');
  } catch (err) {
    logger.error('❌ Database connection failed', { err: (err as Error).message });
    process.exit(1);
  }
}

export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
}
