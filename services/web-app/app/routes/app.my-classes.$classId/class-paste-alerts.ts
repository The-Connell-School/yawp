export type ClassPasteAlert = {
  id: string;
  documentId: string;
  membershipId: string;
  textLength: number;
  createdAt: Date | string;
};

/**
 * Groups a flat list of paste alerts (already scoped to one class's
 * students — see the loader query in route.tsx) by student membership id,
 * newest first, for display in each student's sheet.
 */
export function buildPasteAlertsByStudentId(
  alerts: ClassPasteAlert[]
): Record<string, ClassPasteAlert[]> {
  const byStudentId: Record<string, ClassPasteAlert[]> = {};

  const sorted = [...alerts].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  for (const alert of sorted) {
    (byStudentId[alert.membershipId] ??= []).push(alert);
  }

  return byStudentId;
}

/**
 * The roll-up cell for one student in the class table, so a teacher can see
 * at a glance who has paste activity instead of opening every student sheet
 * one at a time. Returns null when there is nothing to show — an empty cell,
 * not a zero, keeps the column quiet.
 */
export function summarizeStudentPasteActivity(
  alerts: ClassPasteAlert[] | undefined
): { count: number; label: string } | null {
  const count = alerts?.length ?? 0;
  if (count === 0) return null;

  return { count, label: `${count} ${count === 1 ? 'paste' : 'pastes'}` };
}
