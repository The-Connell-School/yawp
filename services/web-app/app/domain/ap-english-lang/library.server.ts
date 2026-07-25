import type { Prisma } from '@app/prisma';
import { DEFAULT_GRADING_ASSISTANT_STRICTNESS_LEVEL } from '~/domain/grading/grading-assistant-strictness';
import { prisma } from '~/utils/db.server';
import {
  AP_ENGLISH_LANG_ASSIGNMENT_TYPE_KEY,
  buildApEnglishLangSnapshot,
} from './schema';

export async function findApEnglishLangAssignmentTypeForOrg(
  organizationId: string,
) {
  return prisma.assignmentType.findFirst({
    where: {
      systemKey: AP_ENGLISH_LANG_ASSIGNMENT_TYPE_KEY,
      archivedAt: null,
      organizationAssignments: { some: { organizationId } },
    },
    select: { id: true, title: true, systemKey: true },
  });
}

export async function listApEnglishLangLibraryEntries(assignmentTypeId: string) {
  return prisma.apEnglishLangPromptLibraryEntry.findMany({
    where: { assignmentTypeId, archivedAt: null },
    orderBy: [{ frqType: 'asc' }, { title: 'asc' }],
    include: { sources: { orderBy: { position: 'asc' } } },
  });
}

export async function getApEnglishLangLibraryEntryForSnapshot(params: {
  assignmentTypeId: string;
  externalKey: string;
}) {
  return prisma.apEnglishLangPromptLibraryEntry.findFirst({
    where: {
      assignmentTypeId: params.assignmentTypeId,
      externalKey: params.externalKey,
      archivedAt: null,
    },
    include: { sources: { orderBy: { position: 'asc' } } },
  });
}

export function buildAssignmentCreateInputFromApEnglishLangEntry(params: {
  assignmentTypeId: string;
  title: string | null;
  gradingAssistantStrictnessLevel?: string;
  entry: NonNullable<
    Awaited<ReturnType<typeof getApEnglishLangLibraryEntryForSnapshot>>
  >;
}): Omit<
  Prisma.AssignmentUncheckedCreateInput,
  'id' | 'createdAt' | 'updatedAt'
> {
  const snapshot = buildApEnglishLangSnapshot(params.entry);
  return {
    assignmentTypeId: params.assignmentTypeId,
    title: params.title ?? params.entry.title,
    prompt: snapshot.prompt,
    gradingAssistantStrictnessLevel:
      params.gradingAssistantStrictnessLevel ??
      DEFAULT_GRADING_ASSISTANT_STRICTNESS_LEVEL,
    apEnglishLangSnapshot: snapshot as Prisma.InputJsonValue,
  };
}
