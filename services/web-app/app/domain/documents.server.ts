import type { Prisma } from '@app/prisma';
import { prisma } from '~/utils/db.server';

export class DocumentCreationError extends Error {}

type AssignmentModuleForSessionCreate = {
  id: string;
  instructions: Array<{ id: string; prompt: string }>;
};

/**
 * Builds the nested-create data for one AssignmentModuleSession per module,
 * seeding the first instruction's prompt as the opening assistant message.
 *
 * Single source of truth for "what does a freshly-created module session
 * look like" — used both when a document is created for an AssignmentType
 * (createDocumentForAssignmentType) and when backfilling sessions that are
 * missing for an existing document (ensureAssignmentModuleSessionsForDocument).
 */
export function buildAssignmentModuleSessionCreateData(
  assignmentModules: AssignmentModuleForSessionCreate[]
) {
  return assignmentModules.map((assignmentModule) => {
    const firstInstruction = assignmentModule.instructions[0];
    return {
      instructionsCompleted: 0,
      assignmentModuleId: assignmentModule.id,
      ...(firstInstruction
        ? {
            messages: {
              create: [
                {
                  content: firstInstruction.prompt,
                  agent: 'assistant',
                  instructionId: firstInstruction.id,
                },
              ],
            },
          }
        : {}),
    };
  });
}

/**
 * Creates any AssignmentModuleSession rows a document is missing for its
 * AssignmentType's current modules, without touching sessions that already
 * exist. Returns true if any sessions were created.
 *
 * A document should always have a session per module because
 * createDocumentForAssignmentType creates them all eagerly at document
 * creation time. This exists to recover documents that reached that state
 * anyway — hand-written seed/import data, or a module added to the
 * AssignmentType after the document was created — so opening a document is
 * never a dead end.
 */
export async function ensureAssignmentModuleSessionsForDocument(
  documentId: string,
  assignmentTypeId: string,
  existingAssignmentModuleIds: string[]
): Promise<boolean> {
  const assignmentModules = await prisma.assignmentModule.findMany({
    where: { assignmentTypeId, deletedAt: null },
    orderBy: { position: 'asc' },
    include: {
      instructions: {
        orderBy: { position: 'asc' },
      },
    },
  });

  const existing = new Set(existingAssignmentModuleIds);
  const missingModules = assignmentModules.filter(
    (assignmentModule) => !existing.has(assignmentModule.id)
  );

  if (missingModules.length === 0) return false;

  await prisma.document.update({
    where: { id: documentId },
    data: {
      assignmentModuleSessions: {
        create: buildAssignmentModuleSessionCreateData(missingModules),
      },
    },
  });

  return true;
}

type CreateDocumentInput = {
  membershipId: string;
  assignmentTypeId: string;
  assignmentId?: string | null;
  classAssignmentId?: string | null;
  apHistorySnapshot?: unknown;
};

type CreatedDocument = {
  documentId: string;
};

export async function createDocumentForAssignmentType(
  input: CreateDocumentInput
): Promise<CreatedDocument> {
  const assignmentType = await prisma.assignmentType.findFirst({
    where: { id: input.assignmentTypeId, archivedAt: null },
    select: { id: true },
  });

  if (!assignmentType) {
    throw new DocumentCreationError('AssignmentType is not available.');
  }

  const assignmentModules = await prisma.assignmentModule.findMany({
    where: { assignmentTypeId: input.assignmentTypeId, deletedAt: null },
    orderBy: { position: 'asc' },
    include: {
      instructions: {
        orderBy: { position: 'asc' },
        include: { buttons: { orderBy: { position: 'asc' } } },
      },
    },
  });

  if (assignmentModules.length === 0) {
    throw new DocumentCreationError('No modules for this AssignmentType.');
  }

  if (input.assignmentId || input.classAssignmentId) {
    const assignment = input.classAssignmentId
      ? await prisma.classAssignment.findUnique({
          where: { id: input.classAssignmentId },
          select: {
            assignmentId: true,
            assignment: { select: { assignmentTypeId: true } },
          },
        })
      : null;

    if (input.classAssignmentId) {
      if (!assignment) {
        throw new DocumentCreationError(
          `ClassAssignment ${input.classAssignmentId} not found`
        );
      }
      if (assignment.assignment.assignmentTypeId !== input.assignmentTypeId) {
        throw new DocumentCreationError(
          `ClassAssignment assignment type does not match input.assignmentTypeId`
        );
      }
      if (
        input.assignmentId &&
        input.assignmentId !== assignment.assignmentId
      ) {
        throw new DocumentCreationError(
          'assignmentId does not match ClassAssignment.assignmentId'
        );
      }
    }

    const templateAssignment = await prisma.assignment.findUnique({
      where: { id: input.assignmentId ?? assignment?.assignmentId },
      select: { assignmentTypeId: true },
    });
    if (!templateAssignment) {
      throw new DocumentCreationError(
        `Assignment ${input.assignmentId ?? assignment?.assignmentId} not found`
      );
    }
    if (templateAssignment.assignmentTypeId !== input.assignmentTypeId) {
      throw new DocumentCreationError(
        `Assignment.assignmentTypeId (${templateAssignment.assignmentTypeId}) does not match input.assignmentTypeId (${input.assignmentTypeId})`
      );
    }

    // One document per assignment per student: if a document already exists
    // for this membership and assignment (prefer classAssignmentId when given),
    // reuse it instead of creating a new one. History is preserved — no deletes.
    const resolvedAssignmentId = input.assignmentId ?? assignment?.assignmentId ?? null;
    // Prefer exact class-assignment match if present.
    if (input.classAssignmentId) {
      const existingByClassAssignment = await prisma.document.findFirst({
        where: {
          membershipId: input.membershipId,
          classAssignmentId: input.classAssignmentId,
          deletedAt: null,
          archivedAt: null,
        },
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      });
      if (existingByClassAssignment) {
        return { documentId: existingByClassAssignment.id };
      }
      // Fallback: legacy documents may be linked only by assignmentId.
      if (resolvedAssignmentId) {
        const existingByAssignment = await prisma.document.findFirst({
          where: {
            membershipId: input.membershipId,
            assignmentId: resolvedAssignmentId,
            deletedAt: null,
            archivedAt: null,
          },
          orderBy: { createdAt: 'asc' },
          select: { id: true },
        });
        if (existingByAssignment) {
          return { documentId: existingByAssignment.id };
        }
      }
    } else if (resolvedAssignmentId) {
      const existingByAssignment = await prisma.document.findFirst({
        where: {
          membershipId: input.membershipId,
          assignmentId: resolvedAssignmentId,
          deletedAt: null,
          archivedAt: null,
        },
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      });
      if (existingByAssignment) {
        return { documentId: existingByAssignment.id };
      }
    }
  }

  const document = await prisma.document.create({
    data: {
      membershipId: input.membershipId,
      text: '',
      html: '',
      title: '',
      assignmentTypeId: input.assignmentTypeId,
      ...(input.assignmentId ? { assignmentId: input.assignmentId } : {}),
      ...(input.classAssignmentId
        ? { classAssignmentId: input.classAssignmentId }
        : {}),
      ...(input.apHistorySnapshot
        ? {
            apHistorySnapshot: input.apHistorySnapshot as Prisma.InputJsonValue,
          }
        : {}),
      assignmentModuleSessions: {
        create: buildAssignmentModuleSessionCreateData(assignmentModules),
      },
    },
    select: { id: true },
  });

  return { documentId: document.id };
}
