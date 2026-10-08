import { PrismaClient } from '../../generated/prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import { isLocalDatabaseUrl } from './database-url';

export { isLocalDatabaseUrl };

function getSchemaFromDatabaseUrl(url: string): string | undefined {
  const match = url.match(/[?&]schema=([^&]+)/i);
  if (!match) return undefined;
  return decodeURIComponent(match[1]);
}

export function buildPrismaPgPoolConfig(
  databaseUrl: string,
  env: NodeJS.ProcessEnv = process.env
) {
  const schema =
    env.DATABASE_SCHEMA?.trim() || getSchemaFromDatabaseUrl(databaseUrl);
  const isRemoteMigrateTunnel = env.REMOTE_MIGRATE_TUNNEL === '1';
  const isLocal = isLocalDatabaseUrl(databaseUrl) && !isRemoteMigrateTunnel;
  const isSimpleLocal =
    !schema && isLocalDatabaseUrl(databaseUrl) && !isRemoteMigrateTunnel;

  if (isSimpleLocal) {
    return { connectionString: databaseUrl, ssl: false as const };
  }

  return {
    connectionString: databaseUrl,
    ...(isLocal ? {} : { ssl: { rejectUnauthorized: false as const } }),
  };
}

export function createPrismaClient(databaseUrl = process.env.DATABASE_URL) {
  if (!databaseUrl?.trim()) {
    throw new Error('DATABASE_URL environment variable is not set');
  }

  const schema =
    process.env.DATABASE_SCHEMA?.trim() ||
    getSchemaFromDatabaseUrl(databaseUrl);
  const poolConfig = buildPrismaPgPoolConfig(databaseUrl);

  const adapter =
    poolConfig.ssl === false && !schema
      ? new PrismaPg(poolConfig)
      : new PrismaPg(
          poolConfig,
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
