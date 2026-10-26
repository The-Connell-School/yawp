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
export function usagePercent(count: UsageCount): number {
  if (count.total <= 0) return 0;
  return Math.min(100, Math.round((count.used / count.total) * 100));
}

export function formatUsageRenewsLabel(renewsAtIso: string): string {
  const date = new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(renewsAtIso));
  return `Renews ${date}`;
}

export function formatUsageRenewsUntil(renewsAtIso: string): string {
  const date = new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(renewsAtIso));
  return date;
}

export type MonthlyUsageWarning = 'none' | 'warning' | 'limit';

export function lessonPlannerMonthlyWarning(
  count: UsageCount
): MonthlyUsageWarning {
  const percent = usagePercent(count);
  if (percent >= 100) return 'limit';
  if (percent >= 90) return 'warning';
  return 'none';
}

export type FreeAccountUsage = ReturnType<typeof buildFreeAccountUsage> & {
  monthly?: boolean;
  /** Org-scoped monthly LP quota applies (pending or approved); sidebar meter stays on `monthly`. */
  lessonPlannerMonthlyMetering?: boolean;
  /** Monthly LP counts for limit UI when pending (`monthly` is false). */
  lessonPlannerMonthly?: UsageCount;
  /** Assignment tiles show unlimited copy while `monthly` may still be false for pending teachers. */
  unlimitedFreeAssignmentTiles?: boolean;
  /** Reporter row is locked until school administrator approval. */
  reporterLocked?: boolean;
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
  /** When false, nav usage rings are hidden (load failure); nav links still work. */
  usageNavMetersAvailable?: boolean;
};

export function lessonPlannerMonthlyUsage(usage: FreeAccountUsage): UsageCount {
  return usage.lessonPlannerMonthly ?? usage.lessonPlans;
}

export function isLessonPlannerMonthlyExhausted(
  usage: FreeAccountUsage
): boolean {
  if (usage.lessonPlannerMonthlyMetering) {
    return lessonPlannerMonthlyUsage(usage).remaining === 0;
  }
  return !usage.monthly && usage.lessonPlans.remaining === 0;
}

/** Tile / picker copy for Class Starter, Prewriting, and Thesis (no N-of-N counters). */
export function freeAssignmentKindUsageMeta(
  usage: Pick<FreeAccountUsage, 'monthly' | 'unlimitedFreeAssignmentTiles'>,
  row: UsageCount
): string {
  const unlimited =
    usage.monthly ||
    usage.unlimitedFreeAssignmentTiles ||
    row.total <= 0;
  if (unlimited) {
    return 'Unlimited';
  }
  if (row.remaining === 0) {
    return 'None left';
  }
  return 'Unlimited';
}
