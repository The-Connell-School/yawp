import { isLocalDatabaseUrl } from '../../../../packages/prisma/scripts/local-dev/database-url';

export function isLocalDevAuthEnabled() {
  return (
    process.env.NODE_ENV === 'development' &&
    isLocalDatabaseUrl(process.env.DATABASE_URL ?? '')
  );
}
