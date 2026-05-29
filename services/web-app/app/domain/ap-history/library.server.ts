import type { Prisma } from '@app/prisma';
import { prisma } from '~/utils/db.server';
import {
  AP_HISTORY_ASSIGNMENT_TYPE_KEY,
  buildApHistorySnapshot,
} from './schema';

export async function findApHistoryAssignmentTypeForOrg(organizationId: string) {
  return prisma.assignmentType.findFirst({
    where: {
      systemKey: AP_HISTORY_ASSIGNMENT_TYPE_KEY,
      archivedAt: null,
      organizationAssignments: { some: { organizationId } },
    },
    select: { id: true, title: true, systemKey: true },
  });
}

export async function listApHistoryLibraryEntries(assignmentTypeId: string) {
  return prisma.apHistoryPromptLibraryEntry.findMany({
    where: { assignmentTypeId, archivedAt: null, course: 'apush' },
    orderBy: [{ essayType: 'asc' }, { periodNumber: 'asc' }, { title: 'asc' }],
    include: { sources: { orderBy: { position: 'asc' } } },
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
    include: { sources: { orderBy: { position: 'asc' } } },
  });
}

export function buildAssignmentCreateInputFromApHistoryEntry(params: {
  classId: string;
  assignmentTypeId: string;
  title: string | null;
  dueDate: Date | null;
  entry: NonNullable<
    Awaited<ReturnType<typeof getApHistoryLibraryEntryForSnapshot>>
  >;
}): Prisma.AssignmentCreateManyInput {
  const snapshot = buildApHistorySnapshot(params.entry);
  return {
    classId: params.classId,
    assignmentTypeId: params.assignmentTypeId,
    title: params.title ?? params.entry.title,
    prompt: snapshot.prompt,
    tutorContext: null,
    dueDate: params.dueDate,
    apHistorySnapshot: snapshot as Prisma.InputJsonValue,
  };
}
