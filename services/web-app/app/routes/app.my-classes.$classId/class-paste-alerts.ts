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
