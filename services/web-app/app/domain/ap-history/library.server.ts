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
