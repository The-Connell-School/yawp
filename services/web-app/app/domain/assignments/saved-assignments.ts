// "My Saved Assignments": the pieces both the server and the browser need.
// The database work lives in `saved-assignments.server.ts`; this module holds
// only what a component can safely import.

import type { GradingAssistantStrictnessLevel } from '~/domain/grading/grading-assistant-strictness';

/**
 * Single switch for the whole feature. Every read and every render site
 * consults this, so turning it off hides "My Saved Assignments" everywhere
 * without touching rows already stored.
 */
export const SAVED_ASSIGNMENTS_ENABLED = true;

/**
 * What the creation sheet starts a graded assignment at. Kept here rather than
 * imported from the grading-intent parser, which is server-only.
 */
export const DEFAULT_SAVED_ASSIGNMENT_POINT_VALUE = 100;

/** A saved assignment as the loaders hand it to the UI. */
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
