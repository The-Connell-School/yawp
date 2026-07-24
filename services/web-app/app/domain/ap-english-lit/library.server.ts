import type { Prisma } from '@app/prisma';
import { DEFAULT_GRADING_ASSISTANT_STRICTNESS_LEVEL } from '~/domain/grading/grading-assistant-strictness';
import { prisma } from '~/utils/db.server';
import {
  AP_ENGLISH_LIT_ASSIGNMENT_TYPE_KEY,
  buildApEnglishLitSnapshot,
} from './schema';

export async function findApEnglishLitAssignmentTypeForOrg(
  organizationId: string,
) {
  return prisma.assignmentType.findFirst({
    where: {
      systemKey: AP_ENGLISH_LIT_ASSIGNMENT_TYPE_KEY,
      archivedAt: null,
      organizationAssignments: { some: { organizationId } },
    },
    select: { id: true, title: true, systemKey: true },
  });
}

export async function listApEnglishLitLibraryEntries(assignmentTypeId: string) {
  return prisma.apEnglishLitPromptLibraryEntry.findMany({
    where: { assignmentTypeId, archivedAt: null },
    orderBy: [{ frqType: 'asc' }, { title: 'asc' }],
    include: { sources: { orderBy: { position: 'asc' } } },
  });
}

export async function getApEnglishLitLibraryEntryForSnapshot(params: {
  assignmentTypeId: string;
  externalKey: string;
}) {
  return prisma.apEnglishLitPromptLibraryEntry.findFirst({
    where: {
      assignmentTypeId: params.assignmentTypeId,
      externalKey: params.externalKey,
      archivedAt: null,
    },
    include: { sources: { orderBy: { position: 'asc' } } },
  });
}

export function buildAssignmentCreateInputFromApEnglishLitEntry(params: {
  assignmentTypeId: string;
  title: string | null;
  gradingAssistantStrictnessLevel?: string;
  entry: NonNullable<
    Awaited<ReturnType<typeof getApEnglishLitLibraryEntryForSnapshot>>
  >;
}): Omit<
  Prisma.AssignmentUncheckedCreateInput,
  'id' | 'createdAt' | 'updatedAt'
> {
  const snapshot = buildApEnglishLitSnapshot(params.entry);
  return {
    assignmentTypeId: params.assignmentTypeId,
    title: params.title ?? params.entry.title,
    prompt: snapshot.prompt,
    gradingAssistantStrictnessLevel:
      params.gradingAssistantStrictnessLevel ??
      DEFAULT_GRADING_ASSISTANT_STRICTNESS_LEVEL,
    apEnglishLitSnapshot: snapshot as Prisma.InputJsonValue,
  };
}
