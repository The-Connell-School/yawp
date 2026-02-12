import { remember } from '@epic-web/remember';
import { PrismaClient } from '@app/prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import chalk from 'chalk';

export const prisma = remember('prisma', () => {
  const logThreshold = 20;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is not set');
  }
  const isLocal =
    connectionString.includes('localhost') ||
    connectionString.includes('127.0.0.1');
  const adapter = new PrismaPg({
    connectionString,
    ssl: isLocal ? false : { rejectUnauthorized: false },
  });

  const client = new PrismaClient({
    adapter,
    log: [
      { level: 'query', emit: 'event' },
      { level: 'error', emit: 'stdout' },
      { level: 'warn', emit: 'stdout' },
    ],
  });
  client.$on('query', async (e) => {
    if (e.duration < logThreshold) return;
    const color =
      e.duration < logThreshold * 1.1
        ? 'green'
        : e.duration < logThreshold * 1.2
          ? 'blue'
          : e.duration < logThreshold * 1.3
            ? 'yellow'
            : e.duration < logThreshold * 1.4
              ? 'redBright'
              : 'red';
    const dur = chalk[color](`${e.duration}ms`);
    // eslint-disable-next-line no-console
    console.info(`prisma:query - ${dur} - ${e.query}`);
  });
  return client;
});
