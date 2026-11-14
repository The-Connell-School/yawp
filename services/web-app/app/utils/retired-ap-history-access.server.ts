import {
  AP_HISTORY_ASSIGNMENT_TYPE_KEY,
  isApHistorySnapshot,
} from '~/domain/ap-history/schema';

export function isRetiredApHistoryAssignmentType(
  systemKey: string | null | undefined
): boolean {
  return systemKey === AP_HISTORY_ASSIGNMENT_TYPE_KEY;
}

export type RetiredApHistoryDocumentShape = {
  apHistorySnapshot?: unknown;
  assignment?: {
    apHistorySnapshot?: unknown;
    assignmentType?: { systemKey: string | null } | null;
  } | null;
  assignmentType?: { systemKey: string | null } | null;
};

export function isRetiredApHistoryDocument(
  doc: RetiredApHistoryDocumentShape
): boolean {
  if (isApHistorySnapshot(doc.apHistorySnapshot)) return true;
  const assignment = doc.assignment;
  if (assignment && isApHistorySnapshot(assignment.apHistorySnapshot)) {
    return true;
  }
  if (isRetiredApHistoryAssignmentType(assignment?.assignmentType?.systemKey)) {
    return true;
  }
  return isRetiredApHistoryAssignmentType(doc.assignmentType?.systemKey);
}

export function throwRetiredApHistoryNotFound(): never {
  throw new Response('Not Found', { status: 404 });
}

export function assertNotRetiredApHistoryDocument(
  doc: RetiredApHistoryDocumentShape
): void {
  if (isRetiredApHistoryDocument(doc)) throwRetiredApHistoryNotFound();
}

export function assertNotRetiredApHistoryAssignmentType(
  systemKey: string | null | undefined
): void {
  if (isRetiredApHistoryAssignmentType(systemKey)) {
    throwRetiredApHistoryNotFound();
  }
}