import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaPg } from '@prisma/adapter-pg';
import type { PrismaClient as PrismaClientType } from '../../../packages/prisma/generated/prisma';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const requireFn = createRequire(import.meta.url);
const generatedClientPath = path.resolve(
  __dirname,
  '../../../packages/prisma/generated/prisma'
);
const prismaModule = requireFn(generatedClientPath);

const PrismaClientCtor =
  (prismaModule as any).PrismaClient ??
  (prismaModule as any).default?.PrismaClient;

if (!PrismaClientCtor) {
  throw new Error('Unable to load PrismaClient from @app/prisma');
}

export type E2EPrismaClient = PrismaClientType;

export function createE2EPrismaClient(): E2EPrismaClient {
  const connectionString = process.env.E2E_DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      'E2E_DATABASE_URL environment variable is required for E2E database helpers'
    );
  }

  const isLocal =
    connectionString.includes('localhost') ||
    connectionString.includes('127.0.0.1');

  const adapter = new PrismaPg({
    connectionString,
    ssl: isLocal ? false : { rejectUnauthorized: false },
  });

  return new PrismaClientCtor({ adapter }) as PrismaClientType;
}
