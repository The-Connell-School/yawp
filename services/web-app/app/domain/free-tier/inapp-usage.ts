/** Read-only presentation model. Caps and counts are supplied by existing policy readers. */
export type UsageCount = { used: number; total: number; remaining: number };
export const FREE_ASSIGNMENT_LABELS: Record<string, string> = {
  class_starter: 'Class Starter',
  prewriting: 'Prewriting',
  thesis_statement: 'Thesis Statement',
};
export function buildFreeAccountUsage(input: {
  monthly?: boolean;
  seatCap: number;
  lessonPlanCap: number;
  assignmentCaps: Record<string, number>;
  students: number;
  pendingInvites: number;
  lessonPlans: number;
  assignmentCounts: Record<string, number>;
}) {
  const count = (used: number, total: number): UsageCount => ({
    used,
    total,
    remaining: Math.max(0, total - used),
  });
  const students = count(input.students + input.pendingInvites, input.seatCap);
  const assignments = Object.entries(input.assignmentCaps).map(
    ([kind, total]) => ({
      kind,
      label: FREE_ASSIGNMENT_LABELS[kind] ?? kind,
      ...count(input.assignmentCounts[kind] ?? 0, total),
    })
  );
  const lessonPlans = count(input.lessonPlans, input.lessonPlanCap);
  const allAssignmentsUsed =
    !input.monthly && assignments.every((a) => a.remaining === 0);
  const exhausted =
    !input.monthly && assignments.find((a) => a.remaining === 0);
  return {
    students,
    assignments,
    lessonPlans,
    allAssignmentsUsed,
    warning:
      students.remaining === 0
        ? 'Class is full'
        : allAssignmentsUsed
          ? 'No free assignments left'
          : exhausted
            ? `${exhausted.label}: none left`
            : lessonPlans.remaining === 0
              ? 'No lesson plans left'
              : null,
  };
}
export type FreeAccountUsage = ReturnType<typeof buildFreeAccountUsage> & {
  monthly?: boolean;
  renewsAt?: string;
  reporter?: UsageCount;
  classCode?: string | null;
  /** True when the teacher is pending approval and join secrets must stay server-side. */
  classCodeHidden?: boolean;
  classId: string | null;
  checklist: {
    classReady: boolean;
    assignmentCreated: boolean;
    writingSubmitted: boolean;
    graded: boolean;
  };
  gradingPause: { retryAt: string; limit: number; window: string } | null;
};
