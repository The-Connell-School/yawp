/* eslint-disable no-console */
import type { Prisma, PrismaClient } from '../../generated/prisma';
import { AP_HISTORY_LIBRARY_ENTRIES } from '../ap-history-library-data';
import { AP_HISTORY_SEED_MODULES } from '../ap-history-module-data';
import { UNIVERSAL_TUTOR_BLOCK } from '../universal-tutor-block';
import {
  AP_HISTORY_HERO_IMAGE,
  apHistoryHeroImageBytes,
} from './ap-history-hero-image';
import { apHistorySourceImageAsset } from './ap-history-source-assets';
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
    description:
      'Curated AP U.S., European, and World History DBQ and LEQ practice with AP rubric coaching.',
    position: 50,
    // The assignment-level General Tutor Instructions box: the universal
    // YAWP! Tutor character, which every module's guidance sits underneath.
    tutorInstructions: UNIVERSAL_TUTOR_BLOCK,
    ownerOrgId: organizationId,
    organizationAssignments: {
      create: { organizationId },
    },
    image: {
      create: {
        contentType: AP_HISTORY_HERO_IMAGE.contentType,
        altText: AP_HISTORY_HERO_IMAGE.altText,
        blob: apHistoryHeroImageBytes(),
      },
    },
    assignmentModules: {
      create: AP_HISTORY_SEED_MODULES.map((moduleData) => ({
        title: moduleData.title,
        position: moduleData.position,
        description: moduleData.description,
        tutorInstructions: moduleData.tutorInstructions,
        tutorInstructionsVariantsJson: moduleData.tutorInstructionsVariantsJson,
        instructions: {
          create: moduleData.instructions,
        },
      })),
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

  const imagesSeeded = await attachApHistorySourceImages(prisma);

  console.log(
    `Seeded AP History Essay type with ${AP_HISTORY_LIBRARY_ENTRIES.length} curated library entries and ${imagesSeeded} self-hosted source images.`
  );
}

/**
 * Attaches the committed public-domain source images to their curated library
 * sources so they serve from our own origin. Idempotent, and a no-op for any
 * source that is not in the database yet.
 */
export async function attachApHistorySourceImages(
  prisma: PrismaClient
): Promise<number> {
  let imagesSeeded = 0;
  for (const entry of AP_HISTORY_LIBRARY_ENTRIES) {
    for (const source of entry.sources) {
      if (source.mediaType !== 'image') continue;
      const asset = apHistorySourceImageAsset(source.externalKey);
      if (!asset) continue;
      const updated = await prisma.apHistoryPromptLibrarySource.updateMany({
        where: { externalKey: source.externalKey },
        data: {
          imageBlob: asset.blob,
          imageContentType: asset.contentType,
        },
      });
      imagesSeeded += updated.count;
    }
  }
  return imagesSeeded;
}
