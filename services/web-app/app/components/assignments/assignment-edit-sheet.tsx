/**
 * The separate assignment edit form used to live here. Editing now runs
 * through `AssignmentCreationSheet` in edit mode, so teachers see one form —
 * same fields, same order — whether they are creating or editing, and
 * settings that cannot change after creation are shown frozen rather than
 * quietly missing.
 *
 * The record shape survives because the class page still types its editing
 * row against it.
 */
export type AssignmentEditRecord = {
  id: string;
  title: string | null;
  prompt: string;
  promptAttachmentName?: string | null;
  submitForGrade: boolean;
  pointValue: number | null;
  assignmentTypeId: string;
  assignmentType: { id: string; title: string };
};
