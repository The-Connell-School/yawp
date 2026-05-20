/* eslint-disable no-console */
import { PrismaClient } from '../generated/prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  PREVIEW_TARGETED_FLAGS,
  computePreviewFlagUpserts,
} from './preview-enable-targeted-flags.helpers';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL environment variable is not set');
}

function getSchemaFromDatabaseUrl(url: string): string | undefined {
  const match = url.match(/[?&]schema=([^&]+)/i);
  if (!match) return undefined;
  return decodeURIComponent(match[1]);
}

const schema =
  process.env.DATABASE_SCHEMA?.trim() ||
  getSchemaFromDatabaseUrl(connectionString);

const isLocal =
  connectionString.includes('localhost') ||
  connectionString.includes('127.0.0.1');

const isSimpleLocal =
  !schema &&
  (connectionString.includes('localhost') ||
    connectionString.includes('127.0.0.1'));

const adapter = isSimpleLocal
  ? new PrismaPg({ connectionString, ssl: false })
  : new PrismaPg(
      {
        connectionString,
        ssl: isLocal ? false : { rejectUnauthorized: false },
      },
      schema ? { schema } : undefined
    );

const prisma = new PrismaClient({ adapter });

async function main() {
  console.log(
    '🚩 Enabling every targeted feature flag for every org/school (preview only)...'
  );

  const [orgs, schools] = await Promise.all([
    prisma.organization.findMany({ select: { id: true } }),
    prisma.school.findMany({ select: { id: true } }),
  ]);

  const upserts = computePreviewFlagUpserts(PREVIEW_TARGETED_FLAGS, {
    orgIds: orgs.map((o) => o.id),
    schoolIds: schools.map((s) => s.id),
  });

  for (const upsert of upserts) {
    await prisma.setting.upsert({
      where: { name: upsert.name },
      create: {
        id: upsert.name,
        name: upsert.name,
        description: upsert.description,
        value: upsert.value,
        valueType: upsert.valueType,
      },
      update: {
        description: upsert.description,
        value: upsert.value,
        valueType: upsert.valueType,
      },
    });
    console.log(
      `  • ${upsert.name} (${upsert.valueType}) — ${
        upsert.value.length > 80
          ? `${upsert.value.slice(0, 77)}...`
          : upsert.value || '(empty)'
      }`
    );
  }

  console.log(
    `🚩 Done. ${upserts.length} setting row(s) upserted across ${orgs.length} org(s) and ${schools.length} school(s).`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
