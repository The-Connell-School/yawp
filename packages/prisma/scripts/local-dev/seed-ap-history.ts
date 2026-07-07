/* eslint-disable no-console */
import type { Prisma, PrismaClient } from '../../generated/prisma';
import { AP_HISTORY_LIBRARY_ENTRIES } from '../ap-history-library-data';
import { LOCAL_DEV_ORG_ID } from './dev-personas';

export const AP_HISTORY_ASSIGNMENT_TYPE_SYSTEM_KEY = 'ap_history_essay';

/**
 * Builds the additive create payload for the curated AP History Essay
 * assignment type, linked to the given org so it surfaces via org defaults.
 * Pure and side-effect free so it can be unit tested without a database.
 */
export function buildApHistoryAssignmentTypeCreateInput(
  organizationId: string
): Prisma.AssignmentTypeUncheckedCreateInput {
  return {
    title: 'AP History Essay',
    systemKey: AP_HISTORY_ASSIGNMENT_TYPE_SYSTEM_KEY,
    description: 'Curated APUSH DBQ and LEQ practice with AP rubric coaching.',
    position: 50,
    ownerOrgId: organizationId,
    organizationAssignments: {
      create: { organizationId },
    },
    assignmentModules: {
      create: [
        {
          title: 'AP History Essay',
          position: 1,
          description: 'Write an APUSH DBQ or LEQ with AP-specific coaching.',
          instructions: {
            create: [
              {
                title: 'Write',
                prompt:
                  'Use the selected APUSH prompt and source panel to draft your response.',
                position: 1,
                showChatButton: true,
              },
            ],
          },
        },
      ],
    },
    apHistoryLibraryEntries: {
      create: AP_HISTORY_LIBRARY_ENTRIES.map((entry) => ({
        externalKey: entry.externalKey,
        course: entry.course,
        essayType: entry.essayType,
        title: entry.title,
        prompt: entry.prompt,
        period: entry.period,
        periodNumber: entry.periodNumber,
        reasoningSkill: entry.reasoningSkill,
        difficulty: entry.difficulty,
        skillEmphasis: entry.skillEmphasis,
        defaultTimeMode: entry.defaultTimeMode,
        defaultDurationMinutes: entry.defaultDurationMinutes,
        provenanceUrl: entry.provenanceUrl,
        sources: {
          create: entry.sources.map((source) => ({
            externalKey: source.externalKey,
            position: source.position,
            title: source.title,
            attribution: source.attribution,
            body: source.body,
            caption: source.caption,
            mediaType: source.mediaType,
            imageUrl: source.imageUrl,
            imageAlt: source.imageAlt,
            provenanceUrl: source.provenanceUrl,
          })),
        },
      })),
    },
  };
}

/**
 * Seeds the curated AP History Essay assignment type + prompt library into the
 * local-dev org. Purely additive: it only creates the AP History type and its
 * children, and no-ops if it already exists. It never mutates other seed data.
 */
export async function seedApHistoryLocalDev(
  prisma: PrismaClient,
  organizationId: string = LOCAL_DEV_ORG_ID
): Promise<void> {
  const existing = await prisma.assignmentType.findUnique({
    where: { systemKey: AP_HISTORY_ASSIGNMENT_TYPE_SYSTEM_KEY },
    select: { id: true },
  });
  if (existing) {
    console.log('AP History Essay assignment type already seeded; skipping.');
    return;
  }

  await prisma.assignmentType.create({
    data: buildApHistoryAssignmentTypeCreateInput(organizationId),
    select: { id: true },
  });

  console.log(
    `Seeded AP History Essay type with ${AP_HISTORY_LIBRARY_ENTRIES.length} curated library entries.`
  );
}
