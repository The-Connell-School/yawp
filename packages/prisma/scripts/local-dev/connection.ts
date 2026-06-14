import { PrismaClient } from '../../generated/prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import { isLocalDatabaseUrl } from './database-url';

export { isLocalDatabaseUrl };

function getSchemaFromDatabaseUrl(url: string): string | undefined {
  const match = url.match(/[?&]schema=([^&]+)/i);
  if (!match) return undefined;
  return decodeURIComponent(match[1]);
}

export function createPrismaClient(databaseUrl = process.env.DATABASE_URL) {
  if (!databaseUrl?.trim()) {
    throw new Error('DATABASE_URL environment variable is not set');
  }

  const schema =
    process.env.DATABASE_SCHEMA?.trim() ||
    getSchemaFromDatabaseUrl(databaseUrl);
  const isLocal = isLocalDatabaseUrl(databaseUrl);
  const isSimpleLocal =
    !schema &&
    (databaseUrl.includes('localhost') ||
      databaseUrl.includes('127.0.0.1'));

  const adapter = isSimpleLocal
    ? new PrismaPg({ connectionString: databaseUrl, ssl: false })
    : new PrismaPg(
        { connectionString: databaseUrl, ssl: isLocal ? false : { rejectUnauthorized: false } },
        schema ? { schema } : undefined
      );

  return new PrismaClient({ adapter });
}

export function assertLocalSeedTarget(databaseUrl = process.env.DATABASE_URL) {
  if (!databaseUrl?.trim()) {
    throw new Error('DATABASE_URL environment variable is not set');
  }
  if (!isLocalDatabaseUrl(databaseUrl)) {
    throw new Error(
      'Local dev seed only runs against localhost or preview Postgres hosts.'
    );
  }
}
