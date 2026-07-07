import type { Prisma } from '@app/prisma';
import { DEFAULT_GRADING_ASSISTANT_STRICTNESS_LEVEL } from '~/domain/grading/grading-assistant-strictness';
import { prisma } from '~/utils/db.server';
import {
  AP_HISTORY_ASSIGNMENT_TYPE_KEY,
  buildApHistorySnapshot,
} from './schema';

export async function findApHistoryAssignmentTypeForOrg(
  organizationId: string
) {
  return prisma.assignmentType.findFirst({
    where: {
      systemKey: AP_HISTORY_ASSIGNMENT_TYPE_KEY,
      archivedAt: null,
      organizationAssignments: { some: { organizationId } },
    },
    select: { id: true, title: true, systemKey: true },
  });
}

// Source fields safe to send to the client / copy into the snapshot. The
// image bytes (imageBlob) and content type stay server-side and are streamed
// only through the dedicated /api/image/ap-history-source route.
const AP_HISTORY_SOURCE_SELECT = {
  externalKey: true,
  position: true,
  title: true,
  attribution: true,
  body: true,
  caption: true,
  mediaType: true,
  imageUrl: true,
  imageAlt: true,
  provenanceUrl: true,
} satisfies Prisma.ApHistoryPromptLibrarySourceSelect;

export async function listApHistoryLibraryEntries(assignmentTypeId: string) {
  return prisma.apHistoryPromptLibraryEntry.findMany({
    where: { assignmentTypeId, archivedAt: null, course: 'apush' },
    orderBy: [{ essayType: 'asc' }, { periodNumber: 'asc' }, { title: 'asc' }],
    include: {
      sources: {
        orderBy: { position: 'asc' },
        select: AP_HISTORY_SOURCE_SELECT,
      },
    },
  });
}

export async function getApHistoryLibraryEntryForSnapshot(params: {
  assignmentTypeId: string;
  externalKey: string;
}) {
  return prisma.apHistoryPromptLibraryEntry.findFirst({
    where: {
      assignmentTypeId: params.assignmentTypeId,
      externalKey: params.externalKey,
      archivedAt: null,
      course: 'apush',
    },
    include: {
      sources: {
        orderBy: { position: 'asc' },
        select: AP_HISTORY_SOURCE_SELECT,
      },
    },
  });
}

export type CustomApHistorySourceInput = {
  position: number;
  title: string;
  attribution: string;
  body: string;
  caption?: string | null;
  mediaType?: string;
  imageUrl?: string | null;
  imageAlt?: string | null;
  provenanceUrl?: string | null;
};

export type CustomApHistoryInput = {
  key: string;
  essayType: string;
  prompt: string;
  period: string;
  periodNumber: number;
  reasoningSkill: string;
  timeMode: string;
  durationMinutes: number;
  sources: CustomApHistorySourceInput[];
};

/**
 * Builds an assignment create input from a teacher-authored (non-library) AP
 * History prompt. Produces the same immutable, versioned snapshot contract as
 * the curated library path, so the student runtime, tutor, and grading
 * assistant all behave identically.
 */
export function buildAssignmentCreateInputFromCustomApHistory(params: {
  assignmentTypeId: string;
  title: string | null;
  gradingAssistantStrictnessLevel?: string;
  custom: CustomApHistoryInput;
}): Omit<
  Prisma.AssignmentUncheckedCreateInput,
  'id' | 'createdAt' | 'updatedAt'
> {
  const { custom } = params;
  const isLeq = custom.essayType === 'leq';
  const snapshot = buildApHistorySnapshot({
    externalKey: custom.key,
    course: 'apush',
    essayType: custom.essayType,
    prompt: custom.prompt,
    period: custom.period,
    periodNumber: custom.periodNumber,
    reasoningSkill: custom.reasoningSkill,
    defaultTimeMode: custom.timeMode,
    defaultDurationMinutes: custom.durationMinutes,
    sources: isLeq
      ? []
      : custom.sources.map((source) => ({
          externalKey: `${custom.key}-doc-${source.position}`,
          position: source.position,
          title: source.title,
          attribution: source.attribution,
          body: source.body,
          caption: source.caption ?? null,
          mediaType: source.mediaType ?? 'text',
          imageUrl: source.imageUrl ?? null,
          imageAlt: source.imageAlt ?? null,
          provenanceUrl: source.provenanceUrl ?? null,
        })),
  });

  return {
    assignmentTypeId: params.assignmentTypeId,
    title: params.title ?? `Custom ${custom.essayType.toUpperCase()}`,
    prompt: snapshot.prompt,
    gradingAssistantStrictnessLevel:
      params.gradingAssistantStrictnessLevel ??
      DEFAULT_GRADING_ASSISTANT_STRICTNESS_LEVEL,
    apHistorySnapshot: snapshot as Prisma.InputJsonValue,
  };
}

export function buildAssignmentCreateInputFromApHistoryEntry(params: {
  assignmentTypeId: string;
  title: string | null;
  gradingAssistantStrictnessLevel?: string;
  entry: NonNullable<
    Awaited<ReturnType<typeof getApHistoryLibraryEntryForSnapshot>>
  >;
}): Omit<
  Prisma.AssignmentUncheckedCreateInput,
  'id' | 'createdAt' | 'updatedAt'
> {
  const snapshot = buildApHistorySnapshot(params.entry);
  return {
    assignmentTypeId: params.assignmentTypeId,
    title: params.title ?? params.entry.title,
    prompt: snapshot.prompt,
    gradingAssistantStrictnessLevel:
      params.gradingAssistantStrictnessLevel ??
      DEFAULT_GRADING_ASSISTANT_STRICTNESS_LEVEL,
    apHistorySnapshot: snapshot as Prisma.InputJsonValue,
  };
}
