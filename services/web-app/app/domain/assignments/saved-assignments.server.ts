// "My Saved Assignments": the assignments a teacher kept for reuse.
//
// An assignment created from the creation sheet can be kept — type, title,
// prompt and the grading/tutor settings — so the teacher can push the same
// assignment to another class next term without retyping it. Saves are keyed
// by a hash of the prompt body so creating the same assignment twice leaves
// exactly one row. This is a configuration store, not a deployment: reusing a
// saved assignment re-opens the creation sheet pre-filled.

import { createHash } from 'node:crypto';
import {
  DEFAULT_GRADING_ASSISTANT_STRICTNESS_LEVEL,
  type GradingAssistantStrictnessLevel,
} from '~/domain/grading/grading-assistant-strictness';
import { prisma } from '~/utils/db.server';

export const MAX_SAVED_ASSIGNMENT_TITLE_LENGTH = 200;
export const MAX_SAVED_ASSIGNMENT_PROMPT_LENGTH = 20000;

/** Where a saved assignment came from. Only the creation sheet writes today. */
export const SAVED_ASSIGNMENT_SOURCE_CREATION_SHEET = 'creation-sheet';

const FALLBACK_TITLE = 'Untitled assignment';

/**
 * Single switch for the whole feature. Every read and every render site
 * consults this, so turning it off hides "My Saved Assignments" without
 * touching rows already stored.
 */
export const SAVED_ASSIGNMENTS_ENABLED = true;

/** A saved assignment as the loaders and the UI see it. */
export type SavedAssignment = {
  id: string;
  title: string;
  prompt: string;
  submitForGrade: boolean;
  pointValue: number | null;
  gradingAssistantStrictnessLevel: GradingAssistantStrictnessLevel;
  tutorEnabled: boolean;
  assignmentTypeId: string;
  assignmentTypeTitle: string;
  savedAt: string;
};

/** A save the caller got wrong (empty or implausibly long prompt). */
export class SavedAssignmentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SavedAssignmentError';
  }
}

/**
 * Stable identity for a prompt body, ignoring surrounding whitespace. Hashed
 * because the body is far too long to index directly.
 */
export function hashSavedAssignmentPrompt(prompt: string): string {
  return createHash('sha256').update(prompt.trim()).digest('hex');
}

type SavedAssignmentRow = {
  id: string;
  title: string;
  prompt: string;
  submitForGrade: boolean;
  pointValue: number | null;
  gradingAssistantStrictnessLevel: string;
  tutorEnabled: boolean;
  createdAt: Date;
  assignmentType: { id: string; title: string };
};

const rowSelect = {
  id: true,
  title: true,
  prompt: true,
  submitForGrade: true,
  pointValue: true,
  gradingAssistantStrictnessLevel: true,
  tutorEnabled: true,
  createdAt: true,
  assignmentType: { select: { id: true, title: true } },
} as const;

function toSavedAssignment(row: SavedAssignmentRow): SavedAssignment {
  return {
    id: row.id,
    title: row.title,
    prompt: row.prompt,
    submitForGrade: row.submitForGrade,
    pointValue: row.pointValue,
    // Stored as a plain string; anything unrecognised reads as the default
    // rather than leaking a bad level into the grading pipeline.
    gradingAssistantStrictnessLevel:
      row.gradingAssistantStrictnessLevel === 'beginner' ||
      row.gradingAssistantStrictnessLevel === 'advanced' ||
      row.gradingAssistantStrictnessLevel === 'intermediate'
        ? row.gradingAssistantStrictnessLevel
        : DEFAULT_GRADING_ASSISTANT_STRICTNESS_LEVEL,
    tutorEnabled: row.tutorEnabled,
    assignmentTypeId: row.assignmentType.id,
    assignmentTypeTitle: row.assignmentType.title,
    savedAt: row.createdAt.toISOString(),
  };
}

export async function saveAssignmentForReuse(params: {
  membershipId: string;
  assignmentTypeId: string;
  title: string;
  prompt: string;
  submitForGrade: boolean;
  pointValue: number | null;
  gradingAssistantStrictnessLevel: GradingAssistantStrictnessLevel;
  tutorEnabled: boolean;
  source?: string;
}): Promise<SavedAssignment> {
  const prompt = params.prompt.trim();
  if (prompt.length === 0) {
    throw new SavedAssignmentError('A prompt is required.');
  }
  if (prompt.length > MAX_SAVED_ASSIGNMENT_PROMPT_LENGTH) {
    throw new SavedAssignmentError('That assignment is too long to save.');
  }

  const title =
    params.title.trim().slice(0, MAX_SAVED_ASSIGNMENT_TITLE_LENGTH) ||
    FALLBACK_TITLE;
  const promptHash = hashSavedAssignmentPrompt(prompt);
  const source = params.source ?? SAVED_ASSIGNMENT_SOURCE_CREATION_SHEET;
  // A point value only means anything when the work is submitted for a grade.
  const pointValue = params.submitForGrade ? (params.pointValue ?? null) : null;
  const settings = {
    title,
    submitForGrade: params.submitForGrade,
    pointValue,
    gradingAssistantStrictnessLevel: params.gradingAssistantStrictnessLevel,
    tutorEnabled: params.tutorEnabled,
  };

  const row = await prisma.savedAssignment.upsert({
    where: {
      membershipId_assignmentTypeId_promptHash: {
        membershipId: params.membershipId,
        assignmentTypeId: params.assignmentTypeId,
        promptHash,
      },
    },
    create: {
      membershipId: params.membershipId,
      assignmentTypeId: params.assignmentTypeId,
      prompt,
      promptHash,
      source,
      ...settings,
    },
    // Re-saving refreshes the settings and restores anything previously removed.
    update: { ...settings, archivedAt: null },
    select: rowSelect,
  });

  return toSavedAssignment(row as SavedAssignmentRow);
}

export async function listSavedAssignments(params: {
  membershipId: string;
}): Promise<SavedAssignment[]> {
  const rows = await prisma.savedAssignment.findMany({
    where: {
      membershipId: params.membershipId,
      archivedAt: null,
      // An assignment type the teacher can no longer use cannot be re-deployed,
      // so it does not belong in the list.
      assignmentType: { archivedAt: null },
    },
    orderBy: { createdAt: 'desc' },
    select: rowSelect,
  });

  return rows.map((row) => toSavedAssignment(row as SavedAssignmentRow));
}

/**
 * Removes a saved assignment from the teacher's list. Scoped by membership so
 * an id guessed from someone else's list is a no-op; returns whether a row was
 * actually archived.
 */
export async function archiveSavedAssignment(params: {
  membershipId: string;
  savedAssignmentId: string;
}): Promise<boolean> {
  const result = await prisma.savedAssignment.updateMany({
    where: {
      id: params.savedAssignmentId,
      membershipId: params.membershipId,
      archivedAt: null,
    },
    data: { archivedAt: new Date() },
  });

  return result.count > 0;
}
