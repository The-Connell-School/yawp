/* eslint-disable no-console */
/**
 * Creates Class Starter, Prewriting, and Thesis Statement assignment types for
 * the free classroom bundle. Does not link them to any existing organization —
 * free orgs receive them via provisioning only.
 *
 *   bun run --cwd packages/prisma seed-free-tier-bundle-assignment-types
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { PrismaClient } from '../generated/prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import { isLocalDatabaseUrl } from './seed-overlay-connection';
import { CLASS_STARTER_KIND } from './seed-class-starter-assignment-type';

const PREWRITING_KIND = 'prewriting';
const THESIS_STATEMENT_KIND = 'thesis_statement';

const fixturesDir = join(import.meta.dir, '../fixtures/prod-fidelity');
const modules = JSON.parse(
  readFileSync(join(fixturesDir, 'assignment-modules.json'), 'utf8')
) as Array<{
  id: string;
  title: string;
  position: number;
  description: string | null;
  tutorInstructions: string | null;
  rubricAlignmentJson: unknown;
}>;
const instructions = JSON.parse(
  readFileSync(join(fixturesDir, 'assignment-module-instructions.json'), 'utf8')
) as Array<{
  position: number;
  title: string;
  prompt: string;
  showChatButton: boolean | null;
  showNextButton: boolean | null;
  assignmentModuleId: string;
}>;

const PREWRITING_MODULE_ID = 'clxiepcvs0005h87l762r5xoh';
const THESIS_MODULE_ID = 'clxiepcvs0006h87l1cb28bwn';

function moduleFromProd(moduleId: string) {
  const mod = modules.find((row) => row.id === moduleId);
  if (!mod) throw new Error(`Missing fixture module ${moduleId}`);
  const steps = instructions
    .filter((row) => row.assignmentModuleId === moduleId)
    .sort((a, b) => a.position - b.position);
  return { mod, steps };
}

function buildPrismaClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is not set');
  const isLocal = isLocalDatabaseUrl(connectionString);
  const adapter = new PrismaPg(
    { connectionString, ssl: isLocal ? false : { rejectUnauthorized: false } }
  );
  return new PrismaClient({ adapter });
}

async function upsertStandaloneType(
  prisma: PrismaClient,
  args: {
    kind: string;
    title: string;
    description: string;
    position: number;
    moduleId: string;
  }
) {
  const { mod, steps } = moduleFromProd(args.moduleId);
  const assignmentType = await prisma.assignmentType.upsert({
    where: { kind: args.kind },
    update: {
      title: args.title,
      description: args.description,
      position: args.position,
      archivedAt: null,
    },
    create: {
      kind: args.kind,
      title: args.title,
      description: args.description,
      position: args.position,
      assignmentModules: {
        create: {
          title: mod.title,
          position: mod.position,
          description: mod.description,
          tutorInstructions: mod.tutorInstructions,
          rubricAlignmentJson: mod.rubricAlignmentJson ?? undefined,
          instructions: {
            create: steps.map((step) => ({
              position: step.position,
              title: step.title,
              prompt: step.prompt,
              showChatButton: step.showChatButton ?? false,
            })),
          },
        },
      },
    },
    select: { id: true, kind: true },
  });
  return assignmentType;
}

export async function seedFreeTierBundleAssignmentTypes(prisma: PrismaClient) {
  const classStarter = await prisma.assignmentType.upsert({
    where: { kind: CLASS_STARTER_KIND },
    update: { archivedAt: null },
    create: {
      kind: CLASS_STARTER_KIND,
      title: 'Class Starter',
      description:
        'Open-ended writing to begin class. Graded on engagement: did the student write, and did they reflect.',
      position: 51,
      assignmentModules: {
        create: {
          title: 'Class Starter',
          position: 1,
          description: 'Short writing to start the period.',
          instructions: {
            create: {
              title: 'Write',
              prompt: 'Write freely about the prompt for ten minutes.',
              position: 1,
              showChatButton: true,
            },
          },
        },
      },
    },
    select: { id: true },
  });

  const prewriting = await upsertStandaloneType(prisma, {
    kind: PREWRITING_KIND,
    title: 'Prewriting',
    description:
      'Explore the prompt and find a specific focus before writing a thesis.',
    position: 52,
    moduleId: PREWRITING_MODULE_ID,
  });

  const thesis = await upsertStandaloneType(prisma, {
    kind: THESIS_STATEMENT_KIND,
    title: 'Thesis Statement',
    description: 'Develop a single clear, arguable thesis sentence.',
    position: 53,
    moduleId: THESIS_MODULE_ID,
  });

  return { classStarter, prewriting, thesis };
}

if (import.meta.main) {
  const prisma = buildPrismaClient();
  seedFreeTierBundleAssignmentTypes(prisma)
    .then((result) => {
      console.log('Free tier bundle assignment types ready:', result);
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
