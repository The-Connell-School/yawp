/* eslint-disable no-console */
/**
 * Creates and maintains the five free-classroom bundle assignment types
 * (Class Starter, Exit Ticket, 5-Paragraph Essay, Pre-writing, Thesis Builder).
 * Does not link them to school org catalogs — FREE_CLASSROOM orgs receive them
 * via provisioning and the idempotent org-grant backfill below.
 *
 *   bun run --cwd packages/prisma seed-free-tier-bundle-assignment-types
 */
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';

import type { PrismaClient } from '../generated/prisma';
import { syncSeedArtwork, type SeedArtwork } from './assignment-type-artwork';
import { createPrismaClient } from './local-dev/connection';
import {
  CLASS_STARTER_KIND,
  CLASS_STARTER_RETIRED_ARTWORK_MD5S,
  readClassStarterImage,
} from './seed-class-starter-assignment-type';
import {
  DEFAULT_OUTPUT_SCHEMA_JSON,
  parseScoringScale,
} from '../../../services/web-app/app/domain/assignment-types/assignment-type-rubric.shared';
import { rubricCategories } from '../../../services/web-app/app/domain/grading/rubric';
import {
  EXIT_TICKET_PROMPT_CONFIG,
  EXIT_TICKET_RUBRIC,
  EXIT_TICKET_SCORING_SCALE,
} from '../../../services/web-app/app/domain/assignment-types/exit-ticket-rubric';
import {
  EXIT_TICKET_ASSIGNMENT_TYPE_KIND,
  EXIT_TICKET_ASSIGNMENT_TYPE_ID,
  EXIT_TICKET_ASSIGNMENT_TYPE_DATA,
  EXIT_TICKET_INSTRUCTION_DATA,
  EXIT_TICKET_MODULE_DATA,
} from './exit-ticket-assignment-type-data';
import { EXIT_TICKET_RETIRED_ARTWORK_MD5S } from './bootstrap-exit-ticket-assignment-type';
import { FREE_CLASSROOM_ASSIGNMENT_KINDS } from '../../../services/web-app/app/utils/entitlements.server';
import assignmentTypeImages from '../fixtures/prod-fidelity/assignment-type-images.json';
import {
  CLASS_STARTER_PROMPT_CONFIG,
  CLASS_STARTER_RUBRIC,
  CLASS_STARTER_SCORING_SCALE,
} from '../../../services/web-app/app/domain/assignment-types/class-starter-rubric';
import {
  PREWRITING_PROMPT_CONFIG,
  PREWRITING_RUBRIC,
  PREWRITING_SCORING_SCALE,
} from '../../../services/web-app/app/domain/assignment-types/prewriting-assignment-type';
import { logScriptError } from '../../../services/web-app/app/utils/log-script-error.server';
import {
  THESIS_STATEMENT_PROMPT_CONFIG,
  THESIS_STATEMENT_RUBRIC,
  THESIS_STATEMENT_SCORING_SCALE,
} from '../../../services/web-app/app/domain/assignment-types/thesis-statement-assignment-type';

const PREWRITING_KIND = 'prewriting';
const THESIS_STATEMENT_KIND = 'thesis_statement';
const FIVE_PARAGRAPH_ESSAY_KIND = 'five_paragraph_essay';
const FIVE_PARAGRAPH_ESSAY_PROD_ID = 'cmamr5eai08sl82y6dsr4ymxo';
const FIVE_PARAGRAPH_FIRST_MODULE_ID = 'cmamr5eai08sn82y6vxdz4ua7';

const BUNDLE_ASSIGNMENT_KINDS = [...FREE_CLASSROOM_ASSIGNMENT_KINDS];

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

const CLASS_STARTER_MODULE = {
  title: 'Class Starter',
  position: 1,
  description: 'Short writing to start the period.',
  steps: [
    {
      title: 'Write',
      prompt: 'Write freely about the prompt for ten minutes.',
      position: 1,
      showChatButton: true,
    },
  ],
} as const;

const RUBRIC_DEFAULTS_BY_KIND: Record<
  string,
  {
    scoringScale: unknown;
    rubric: unknown;
    promptConfig: unknown;
    calibrationNotes: string;
  }
> = {
  [CLASS_STARTER_KIND]: {
    scoringScale: CLASS_STARTER_SCORING_SCALE,
    rubric: CLASS_STARTER_RUBRIC,
    promptConfig: CLASS_STARTER_PROMPT_CONFIG,
    calibrationNotes:
      'Class Starter judges engagement only — that the student wrote and reflected.',
  },
  [PREWRITING_KIND]: {
    scoringScale: PREWRITING_SCORING_SCALE,
    rubric: PREWRITING_RUBRIC,
    promptConfig: PREWRITING_PROMPT_CONFIG,
    calibrationNotes:
      'Standalone pre-writing: exploratory effort and movement toward a specific focus.',
  },
  [THESIS_STATEMENT_KIND]: {
    scoringScale: THESIS_STATEMENT_SCORING_SCALE,
    rubric: THESIS_STATEMENT_RUBRIC,
    promptConfig: THESIS_STATEMENT_PROMPT_CONFIG,
    calibrationNotes:
      'Standalone thesis statement: one arguable sentence with observation and analysis.',
  },
  [EXIT_TICKET_ASSIGNMENT_TYPE_KIND]: {
    scoringScale: EXIT_TICKET_SCORING_SCALE,
    rubric: EXIT_TICKET_RUBRIC,
    promptConfig: EXIT_TICKET_PROMPT_CONFIG,
    calibrationNotes:
      'Exit Tickets judge understanding only, with overall feedback and no grammar highlighting.',
  },
  [FIVE_PARAGRAPH_ESSAY_KIND]: {
    scoringScale: parseScoringScale(null),
    rubric: {
      categories: rubricCategories.map((category) => ({
        key: category.key,
        label: category.label,
        description: category.description,
        weight: category.weight,
      })),
    },
    promptConfig: { instructionsPreset: 'legacy_thesis_driven_essay' },
    calibrationNotes:
      'The platform 5-Paragraph Essay uses the thesis-driven essay grading assistant path.',
  },
};

async function ensureAssignmentModules(
  prisma: PrismaClient,
  assignmentTypeId: string,
  payload: {
    title: string;
    position: number;
    description: string | null;
    tutorInstructions?: string | null;
    rubricAlignmentJson?: unknown;
    steps: Array<{
      position: number;
      title: string;
      prompt: string;
      showChatButton: boolean;
    }>;
  }
) {
  const existing = await prisma.assignmentModule.count({
    where: { assignmentTypeId },
  });
  if (existing > 0) return;
  const moduleId = `free-tier-${randomUUID()}`;
  await prisma.$executeRawUnsafe(
    `
      INSERT INTO "AssignmentModule"
        ("id", "assignmentTypeId", "title", "position", "description", "tutorInstructions", "rubricAlignmentJson")
      VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
    `,
    moduleId,
    assignmentTypeId,
    payload.title,
    payload.position,
    payload.description,
    payload.tutorInstructions ?? null,
    payload.rubricAlignmentJson == null ? null : JSON.stringify(payload.rubricAlignmentJson)
  );
  for (const step of payload.steps) {
    await prisma.$executeRawUnsafe(
      `
        INSERT INTO "AssignmentModuleInstruction"
          ("id", "assignmentModuleId", "position", "title", "prompt", "showChatButton")
        VALUES ($1, $2, $3, $4, $5, $6)
      `,
      `free-tier-${randomUUID()}`,
      moduleId,
      step.position,
      step.title,
      step.prompt,
      step.showChatButton
    );
  }
}

async function applyBundleRubricDefaults(
  prisma: PrismaClient,
  assignmentTypeId: string,
  kind: string
) {
  const defaults = RUBRIC_DEFAULTS_BY_KIND[kind];
  if (!defaults) return;
  const existing = await prisma.assignmentType.findUnique({
    where: { id: assignmentTypeId },
    select: { rubricJson: true },
  });
  if (existing?.rubricJson) return;
  await prisma.assignmentType.update({
    where: { id: assignmentTypeId },
    data: {
      scoringScaleJson: defaults.scoringScale as object,
      rubricJson: defaults.rubric as object,
      gradingPromptConfigJson: defaults.promptConfig as object,
      gradingOutputSchemaJson: DEFAULT_OUTPUT_SCHEMA_JSON as object,
      gradingCalibrationNotes: defaults.calibrationNotes,
    },
  });
}

export function readBundleTileImage(
  filename: string,
  altText: string
): SeedArtwork {
  return {
    blob: readFileSync(join(import.meta.dir, 'assets', filename)),
    contentType: 'image/jpeg',
    altText,
  };
}

/**
 * The card artwork for each bundle type: a 940x788 JPEG in ./assets with the
 * same torn paper edge and scratchy ink as the Daily Pages card. The drawing
 * fills the card on its own; the tile already prints the type's title, so
 * there is no wordmark. Authored art, so it lives in the repo rather than a fixture bundle.
 */
export const BUNDLE_TILE_IMAGES: Record<
  string,
  { file: string; altText: string }
> = {
  [CLASS_STARTER_KIND]: {
    file: 'class-starter.jpg',
    altText: readClassStarterImage().altText,
  },
  [PREWRITING_KIND]: {
    file: 'prewriting.jpg',
    altText:
      'A scratchy ink drawing of a dog in a beret and striped shirt with a lightbulb over its head, on torn white paper.',
  },
  [THESIS_STATEMENT_KIND]: {
    file: 'thesis-statement.jpg',
    altText:
      'A scratchy ink drawing of a dog in a beret and striped shirt saying yawp! in a speech bubble, on torn white paper.',
  },
};

/**
 * md5 of every card this seed has shipped before the current one, by kind. A
 * database still showing one of these gets the current card on the next run
 * (this seed runs on every preview deploy); a card somebody uploaded
 * themselves is never touched.
 */
export const BUNDLE_RETIRED_ARTWORK_MD5S: Record<string, string[]> = {
  [CLASS_STARTER_KIND]: CLASS_STARTER_RETIRED_ARTWORK_MD5S,
  [PREWRITING_KIND]: [
    // Brainstorming notes and a pencil, the first card (October 2026).
    '2e22d9bede4d3eee6d1ca26a446ef931',
    // The dog in a beret, as first encoded on the pr-892 preview (Nov 6, 2026).
    '0894136c31fa3eee303d703e72a3ba6c',
    // The dog above the Pre-Writing wordmark (November 2026).
    'f903a3e91b54fc985e511c39a5e3c137',
  ],
  [THESIS_STATEMENT_KIND]: [
    // A quill writing an underlined thesis sentence, the first card (October 2026).
    'c024adc8c638fbec53ac10bb4cb86d18',
    // The dog saying yawp!, as first encoded on the pr-892 preview (Nov 6, 2026).
    '8124afc102fdb63532b6602643dc193d',
    // The dog above the Thesis Statement wordmark (November 2026).
    'd0d12c18db5bed8eefa47bb550de2ff9',
  ],
};

export async function ensureBundleTypeImage(
  prisma: Pick<PrismaClient, 'assignmentTypeImage'>,
  assignmentTypeId: string,
  kind: string
) {
  const spec = BUNDLE_TILE_IMAGES[kind];
  if (!spec) return;
  await syncSeedArtwork(
    prisma,
    assignmentTypeId,
    readBundleTileImage(spec.file, spec.altText),
    BUNDLE_RETIRED_ARTWORK_MD5S[kind] ?? []
  );
}

function fixtureImageForAssignmentType(assignmentTypeId: string) {
  const row = assignmentTypeImages.find(
    (image) => image.assignmentTypeId === assignmentTypeId
  );
  if (!row) return null;
  return {
    blob: Buffer.from(row.blob.base64, 'base64'),
    contentType: row.contentType,
    altText: row.altText ?? '',
  };
}

export async function ensureBundleTypeFixtureImage(
  prisma: Pick<PrismaClient, 'assignmentTypeImage'>,
  assignmentTypeId: string,
  fixtureAssignmentTypeId: string,
  altText: string,
  retiredMd5s: string[] = []
) {
  const fixture = fixtureImageForAssignmentType(fixtureAssignmentTypeId);
  if (!fixture) {
    throw new Error(`free_tier_bundle_fixture_image_missing:${fixtureAssignmentTypeId}`);
  }
  await syncSeedArtwork(
    prisma,
    assignmentTypeId,
  {
      ...fixture,
      altText: altText || fixture.altText,
    },
    retiredMd5s
  );
}

export async function assertFreeTierBundleAssignmentTypeParity(
  prisma: PrismaClient
) {
  const kinds = BUNDLE_ASSIGNMENT_KINDS;
  const types = await prisma.assignmentType.findMany({
    where: { kind: { in: kinds } },
    select: {
      id: true,
      kind: true,
      rubricJson: true,
      assignmentModules: { select: { id: true } },
    },
  });
  if (types.length !== kinds.length) {
    throw new Error('free_tier_bundle_types_missing');
  }
  for (const type of types) {
    if (!type.rubricJson || type.assignmentModules.length === 0) {
      throw new Error(`free_tier_bundle_type_incomplete:${type.kind}`);
    }
    const image = await prisma.assignmentTypeImage.findUnique({
      where: { assignmentTypeId: type.id },
      select: { id: true },
    });
    if (!image) {
      throw new Error(`free_tier_bundle_type_missing_image:${type.kind}`);
    }
  }
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
  const existing = await prisma.assignmentType.findUnique({
    where: { kind: args.kind },
    select: { id: true, kind: true },
  });
  const assignmentType =
    existing ??
    (await prisma.assignmentType.create({
      data: {
        kind: args.kind,
        title: args.title,
        description: args.description,
        position: args.position,
      },
      select: { id: true, kind: true },
    }));
  if (existing) {
    await prisma.assignmentType.update({
      where: { id: assignmentType.id },
      data: {
        title: args.title,
        description: args.description,
        position: args.position,
      },
    });
  }
  await ensureAssignmentModules(prisma, assignmentType.id, {
    title: mod.title,
    position: mod.position,
    description: mod.description,
    tutorInstructions: mod.tutorInstructions,
    rubricAlignmentJson: mod.rubricAlignmentJson,
    steps: steps.map((step) => ({
      position: step.position,
      title: step.title,
      prompt: step.prompt,
      showChatButton: step.showChatButton ?? false,
    })),
  });
  await applyBundleRubricDefaults(prisma, assignmentType.id, args.kind);
  await ensureBundleTypeImage(prisma, assignmentType.id, args.kind);
  return assignmentType;
}

async function ensureExitTicketBundleType(prisma: PrismaClient) {
  let assignmentType = await prisma.assignmentType.findUnique({
    where: { kind: EXIT_TICKET_ASSIGNMENT_TYPE_KIND },
    select: { id: true, kind: true },
  });
  if (!assignmentType) {
    assignmentType = await prisma.assignmentType.create({
      data: {
        id: EXIT_TICKET_ASSIGNMENT_TYPE_ID,
        kind: EXIT_TICKET_ASSIGNMENT_TYPE_KIND,
        ...EXIT_TICKET_ASSIGNMENT_TYPE_DATA,
        position: 52,
        ownerOrgId: null,
        ownerMembershipId: null,
      },
      select: { id: true, kind: true },
    });
    await ensureAssignmentModules(prisma, assignmentType.id, {
      title: EXIT_TICKET_MODULE_DATA.title,
      position: EXIT_TICKET_MODULE_DATA.position,
      description: EXIT_TICKET_MODULE_DATA.description ?? null,
      steps: [
        {
          position: EXIT_TICKET_INSTRUCTION_DATA.position,
          title: EXIT_TICKET_INSTRUCTION_DATA.title,
          prompt: EXIT_TICKET_INSTRUCTION_DATA.prompt,
          showChatButton: EXIT_TICKET_INSTRUCTION_DATA.showChatButton,
        },
      ],
    });
  } else {
    await prisma.assignmentType.update({
      where: { id: assignmentType.id },
      data: {
        title: EXIT_TICKET_ASSIGNMENT_TYPE_DATA.title,
        description: EXIT_TICKET_ASSIGNMENT_TYPE_DATA.description,
        position: 52,
      },
    });
  }
  await applyBundleRubricDefaults(
    prisma,
    assignmentType.id,
    EXIT_TICKET_ASSIGNMENT_TYPE_KIND
  );
  await ensureBundleTypeFixtureImage(
    prisma,
    assignmentType.id,
    EXIT_TICKET_ASSIGNMENT_TYPE_ID,
    'A black-and-white drawing of a torn admission ticket stub stamped Exit Ticket, tilted on a yellow background.',
    EXIT_TICKET_RETIRED_ARTWORK_MD5S
  );
  return assignmentType;
}

async function ensureFiveParagraphEssayBundleType(prisma: PrismaClient) {
  const title = 'The 5-Paragraph Essay';
  const description =
    'In this course, students learn the basic, fundamental form for academic writing.';
  let assignmentType = await prisma.assignmentType.findUnique({
    where: { kind: FIVE_PARAGRAPH_ESSAY_KIND },
    select: { id: true, kind: true },
  });
  if (!assignmentType) {
    const byProdId = await prisma.assignmentType.findUnique({
      where: { id: FIVE_PARAGRAPH_ESSAY_PROD_ID },
      select: { id: true, kind: true },
    });
    if (byProdId) {
      assignmentType = await prisma.assignmentType.update({
        where: { id: byProdId.id },
        data: {
          kind: FIVE_PARAGRAPH_ESSAY_KIND,
          title,
          description,
          position: 53,
        },
        select: { id: true, kind: true },
      });
    } else {
      const byTitle = await prisma.assignmentType.findFirst({
        where: {
          title: { equals: title, mode: 'insensitive' },
          ownerOrgId: null,
          ownerMembershipId: null,
        },
        select: { id: true, kind: true },
      });
      if (byTitle) {
        assignmentType = await prisma.assignmentType.update({
          where: { id: byTitle.id },
          data: {
            kind: FIVE_PARAGRAPH_ESSAY_KIND,
            title,
            description,
            position: 53,
          },
          select: { id: true, kind: true },
        });
      } else {
        assignmentType = await prisma.assignmentType.create({
          data: {
            id: FIVE_PARAGRAPH_ESSAY_PROD_ID,
            kind: FIVE_PARAGRAPH_ESSAY_KIND,
            title,
            description,
            position: 53,
          },
          select: { id: true, kind: true },
        });
      }
    }
  } else {
    await prisma.assignmentType.update({
      where: { id: assignmentType.id },
      data: { title, description, position: 53 },
    });
  }

  const moduleCount = await prisma.assignmentModule.count({
    where: { assignmentTypeId: assignmentType.id },
  });
  if (moduleCount === 0) {
    const { mod, steps } = moduleFromProd(FIVE_PARAGRAPH_FIRST_MODULE_ID);
    await ensureAssignmentModules(prisma, assignmentType.id, {
      title: mod.title,
      position: mod.position,
      description: mod.description,
      tutorInstructions: mod.tutorInstructions,
      rubricAlignmentJson: mod.rubricAlignmentJson,
      steps: steps.map((step) => ({
        position: step.position,
        title: step.title,
        prompt: step.prompt,
        showChatButton: step.showChatButton ?? false,
      })),
    });
  }

  await applyBundleRubricDefaults(
    prisma,
    assignmentType.id,
    FIVE_PARAGRAPH_ESSAY_KIND
  );
  await ensureBundleTypeFixtureImage(
    prisma,
    assignmentType.id,
    FIVE_PARAGRAPH_ESSAY_PROD_ID,
    'Course artwork for the 5-Paragraph Essay assignment type.',
    []
  );
  return assignmentType;
}

/** Idempotent: every FREE_CLASSROOM org receives every bundle type grant. */
export async function backfillFreeClassroomBundleOrganizationGrants(
  prisma: PrismaClient
) {
  const types = await prisma.assignmentType.findMany({
    where: { kind: { in: [...BUNDLE_ASSIGNMENT_KINDS] } },
    select: { id: true, kind: true },
  });
  if (types.length !== BUNDLE_ASSIGNMENT_KINDS.length) {
    throw new Error('free_tier_bundle_types_missing');
  }
  const organizations = await prisma.organization.findMany({
    where: { plan: 'FREE_CLASSROOM' },
    select: { id: true },
  });
  for (const organization of organizations) {
    for (const type of types) {
      await prisma.organizationAssignmentType.upsert({
        where: {
          organizationId_assignmentTypeId: {
            organizationId: organization.id,
            assignmentTypeId: type.id,
          },
        },
        create: {
          organizationId: organization.id,
          assignmentTypeId: type.id,
        },
        update: {},
      });
    }
  }
  return { organizations: organizations.length, types: types.length };
}

export async function seedFreeTierBundleAssignmentTypes(prisma: PrismaClient) {
  const existingClassStarter = await prisma.assignmentType.findUnique({
    where: { kind: CLASS_STARTER_KIND },
    select: { id: true, kind: true },
  });
  const classStarter =
    existingClassStarter ??
    (await prisma.assignmentType.create({
      data: {
        kind: CLASS_STARTER_KIND,
        title: 'Class Starter',
        description:
          'Open-ended writing to begin class. Graded on engagement: did the student write, and did they reflect.',
        position: 51,
      },
      select: { id: true, kind: true },
    }));
  await prisma.assignmentType.update({
    where: { id: classStarter.id },
    data: {
      title: 'Class Starter',
      description:
        'Open-ended writing to begin class. Graded on engagement: did the student write, and did they reflect.',
      position: 51,
    },
  });
  await ensureAssignmentModules(prisma, classStarter.id, {
    title: CLASS_STARTER_MODULE.title,
    position: CLASS_STARTER_MODULE.position,
    description: CLASS_STARTER_MODULE.description,
    steps: [...CLASS_STARTER_MODULE.steps],
  });
  await applyBundleRubricDefaults(prisma, classStarter.id, CLASS_STARTER_KIND);
  await ensureBundleTypeImage(prisma, classStarter.id, CLASS_STARTER_KIND);

  const exitTicket = await ensureExitTicketBundleType(prisma);
  const fiveParagraphEssay = await ensureFiveParagraphEssayBundleType(prisma);

  const prewriting = await upsertStandaloneType(prisma, {
    kind: PREWRITING_KIND,
    title: 'Pre-writing',
    description:
      'Explore the prompt and find a specific focus before writing a thesis.',
    position: 54,
    moduleId: PREWRITING_MODULE_ID,
  });

  const thesis = await upsertStandaloneType(prisma, {
    kind: THESIS_STATEMENT_KIND,
    title: 'Thesis Builder',
    description: 'Develop a single clear, arguable thesis sentence.',
    position: 55,
    moduleId: THESIS_MODULE_ID,
  });

  await assertFreeTierBundleAssignmentTypeParity(prisma);
  await backfillFreeClassroomBundleOrganizationGrants(prisma);

  return {
    classStarter,
    exitTicket,
    fiveParagraphEssay,
    prewriting,
    thesis,
  };
}

if (import.meta.main) {
  const prisma = createPrismaClient();
  seedFreeTierBundleAssignmentTypes(prisma)
    .then((result) => {
      console.log('Free tier bundle assignment types ready:', result);
    })
    .catch((error) => {
      logScriptError(error);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
