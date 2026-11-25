export const ASSIGNMENT_TITLE_REQUIRED_MESSAGE = 'Add an assignment title.';

export function parseRequiredAssignmentTitle(raw: string | null | undefined):
  | { ok: true; title: string }
  | { ok: false; message: string } {
  const title = raw?.trim() ?? '';
  if (!title) {
    return { ok: false, message: ASSIGNMENT_TITLE_REQUIRED_MESSAGE };
  }
  return { ok: true, title };
}