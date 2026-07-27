import { isLocalDatabaseUrl } from '../../../../packages/prisma/scripts/local-dev/database-url';

export function isLocalDevAuthEnabled() {
  return (
    process.env.NODE_ENV === 'development' &&
    process.env.PREVIEW_DATA_MODE !== 'production-dump' &&
    isLocalDatabaseUrl(process.env.DATABASE_URL ?? '')
  );
}
