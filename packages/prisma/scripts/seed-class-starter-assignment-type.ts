/* eslint-disable no-console */
/**
 * Creates the Class Starter assignment type.
 *
 * `AssignmentType.kind` is what selects a grading assistant, and it is not
 * something the admin "New assignment type" form can set — that form writes
 * `kind: null`. So a Class Starter cannot be created through the UI: a row made
 * that way would grade on the thesis-driven essay rubric instead of the soft,
 * effort-based Class Starter assistant. This script is how the row gets made.
 *
 * `kind` is unique, so there is exactly one Class Starter row per database and
 * running this twice is a no-op. Rerunning also un-archives it, which makes
 * this the recovery path if someone archives it by mistake.
 *
 *   bun run --cwd packages/prisma seed-class-starter-assignment-type
 */
import { PrismaClient } from '../generated/prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import { isLocalDatabaseUrl } from './seed-overlay-connection';

/** Must match CLASS_STARTER_ASSIGNMENT_TYPE_KIND in the web app. */
export const CLASS_STARTER_KIND = 'class_starter';

export const CLASS_STARTER_ASSIGNMENT_TYPE_DATA = {
  title: 'Class Starter',
  description:
    'Open-ended writing to begin class. Graded on engagement: did the student write, and did they reflect.',
  position: 51,
} as const;

const MODULE_DATA = {
  title: 'Class Starter',
  position: 1,
  description: 'Short writing to start the period.',
} as const;

const INSTRUCTION_DATA = {
  title: 'Write',
  prompt: 'Write freely about the prompt for ten minutes.',
  position: 1,
  showChatButton: true,
} as const;

type SeedablePrisma = Pick<
  PrismaClient,
  'organization' | 'assignmentType' | 'organizationAssignmentType'
>;

export async function seedClassStarterAssignmentType(prisma: SeedablePrisma) {
  const org = await prisma.organization.findFirst({
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });

  if (!org) {
    throw new Error(
      'Cannot seed the Class Starter assignment type without an organization.'
    );
  }

  const assignmentType = await prisma.assignmentType.upsert({
    where: { kind: CLASS_STARTER_KIND },
    // Deliberately narrow: title, description and position are ours to keep
    // current, and archiving is undone. Ownership and module content belong to
    // whoever has been editing the row since, so rerunning never takes those
    // back.
    update: {
      ...CLASS_STARTER_ASSIGNMENT_TYPE_DATA,
      archivedAt: null,
    },
    create: {
      ...CLASS_STARTER_ASSIGNMENT_TYPE_DATA,
      kind: CLASS_STARTER_KIND,
      ownerOrgId: org.id,
      organizationAssignments: {
        create: { organizationId: org.id },
      },
      assignmentModules: {
        create: {
          ...MODULE_DATA,
          instructions: { create: INSTRUCTION_DATA },
        },
      },
    },
    select: { id: true },
  });

  // Separate from the create above so a row that predates this script — or one
  // whose org link was removed — still ends up visible to that org's teachers.
  await prisma.organizationAssignmentType.upsert({
    where: {
      organizationId_assignmentTypeId: {
        organizationId: org.id,
        assignmentTypeId: assignmentType.id,
      },
    },
    create: {
      organizationId: org.id,
      assignmentTypeId: assignmentType.id,
    },
    update: {},
  });

  return assignmentType;
}

function getSchemaFromDatabaseUrl(url: string): string | undefined {
  const match = url.match(/[?&]schema=([^&]+)/i);
  if (!match) return undefined;
  return decodeURIComponent(match[1]);
}

function buildPrismaClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is not set');
  }

  const schema =
    process.env.DATABASE_SCHEMA?.trim() ||
    getSchemaFromDatabaseUrl(connectionString);
  const isLocal = isLocalDatabaseUrl(connectionString);
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

  return new PrismaClient({ adapter });
}

if (import.meta.main) {
  const prisma = buildPrismaClient();
  seedClassStarterAssignmentType(prisma)
    .then((assignmentType) => {
      console.log(`Class Starter assignment type ready: ${assignmentType.id}`);
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
