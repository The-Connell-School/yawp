/* eslint-disable no-console */
// Idempotently upsert the 22 staff-curated model essays from the YAWP Model
// Essays Collection v3. Safe to run repeatedly; will not duplicate rows.
//
// Usage:
//   DATABASE_URL=postgres://... bun packages/prisma/scripts/seed-model-essays.ts
//
// Designed to be production-safe: does NOT wipe data, does NOT touch any
// table other than ModelEssay. AssignmentType / Module / grade level tags
// are left null; staff can attach them post-seed from the admin route.
import { PrismaClient } from '../generated/prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import { MODEL_ESSAY_SEEDS } from './model-essays-seed-data';

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

const adapter = !schema && isLocal
  ? new PrismaPg({ connectionString, ssl: false })
  : new PrismaPg(
      {
        connectionString,
        ssl: isLocal ? false : { rejectUnauthorized: false },
      },
      schema ? { schema } : undefined
    );

const prisma = new PrismaClient({ adapter });

// Deterministic id so re-running the seed updates existing rows in place
// rather than creating duplicates.
function seedId(slug: string): string {
  return `model-essay-seed-${slug}`;
}

async function main() {
  console.log(`Seeding ${MODEL_ESSAY_SEEDS.length} model essays...`);

  let created = 0;
  let updated = 0;

  for (const essay of MODEL_ESSAY_SEEDS) {
    const id = seedId(essay.slug);
    const existing = await prisma.modelEssay.findUnique({
      where: { id },
      select: { id: true },
    });

    await prisma.modelEssay.upsert({
      where: { id },
      create: {
        id,
        title: essay.title,
        subtitle: essay.subtitle,
        body: essay.body,
        essayType: essay.essayType,
        part: essay.part,
        topicCategory: essay.topicCategory,
        teachingNotes: essay.teachingNotes,
        draftingNotes: essay.draftingNotes,
      },
      update: {
        title: essay.title,
        subtitle: essay.subtitle,
        body: essay.body,
        essayType: essay.essayType,
        part: essay.part,
        topicCategory: essay.topicCategory,
        teachingNotes: essay.teachingNotes,
        draftingNotes: essay.draftingNotes,
      },
    });

    if (existing) updated += 1;
    else created += 1;
  }

  console.log(`Done. Created ${created}, updated ${updated}.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
