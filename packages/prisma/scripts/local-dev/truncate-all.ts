import type { PrismaClient } from '../../generated/prisma';

export async function truncateAllPublicTables(prisma: Pick<PrismaClient, '$queryRaw' | '$executeRawUnsafe'>) {
  const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename NOT IN ('_prisma_migrations', 'InternalImpersonationSession', 'InternalImpersonationEvent', 'InternalQaFixture')
  `;

  if (tables.length === 0) return;

  const quotedTables = tables
    .map(({ tablename }) => `"public"."${tablename.replace(/"/g, '""')}"`)
    .join(', ');

  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${quotedTables} RESTART IDENTITY CASCADE;`
  );
}
