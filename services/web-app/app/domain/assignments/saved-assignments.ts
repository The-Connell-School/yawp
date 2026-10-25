// "My Saved Assignments": the pieces both the server and the browser need.
// The database work lives in `saved-assignments.server.ts`; this module holds
// only what a component can safely import.

import type { CollaborationGroupMode } from '~/domain/assignments/collaboration';
import type { GradingAssistantStrictnessLevel } from '~/domain/grading/grading-assistant-strictness';

/**
 * Single switch for the whole feature. Every read and every render site
 * consults this, so turning it off hides "My Saved Assignments" everywhere
 * without touching rows already stored.
 */
export const SAVED_ASSIGNMENTS_ENABLED = false;

/**
 * What the creation sheet starts a graded assignment at. Kept here rather than
 * imported from the grading-intent parser, which is server-only.
 */
export const DEFAULT_SAVED_ASSIGNMENT_POINT_VALUE = 100;

/**
 * Short daily writing: five or ten minutes is not a hundred-point assignment
 * (Brian's round 4, item 2). Teachers can still change it.
 */
export const SHORT_WRITING_POINT_VALUE = 20;
const SHORT_WRITING_KINDS = new Set(['class_starter', 'exit_ticket']);

/** What a new assignment of this type is worth until the teacher says otherwise. */
export function defaultPointValueForKind(kind: string | null | undefined): number {
  return kind && SHORT_WRITING_KINDS.has(kind) ? SHORT_WRITING_POINT_VALUE : DEFAULT_SAVED_ASSIGNMENT_POINT_VALUE;
}

/** A saved assignment as the loaders hand it to the UI. */
export type SavedAssignment = {
  id: string;
  title: string;
  prompt: string;
  submitForGrade: boolean;
  pointValue: number | null;
  gradingAssistantStrictnessLevel: GradingAssistantStrictnessLevel;
  tutorEnabled: boolean;
  collaborationEnabled: boolean;
  collaborationGroupMode: CollaborationGroupMode;
  collaborationGroupSize: number | null;
  assignmentTypeId: string;
  assignmentTypeTitle: string;
  savedAt: string;
};
