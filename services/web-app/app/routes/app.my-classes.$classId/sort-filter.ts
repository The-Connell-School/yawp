// Sort and filter helpers for the Students and Assignments tabs.
// Behaviour is exercised by sort-filter.test.ts; the spec lives at
// yawp-pm: features/my-classes-sorting-filters.md.

export type SortDirection = 'asc' | 'desc';
export type AssignmentSortColumn = 'title' | 'dueDate';

export interface AssignmentSort {
  column: AssignmentSortColumn;
  direction: SortDirection;
}

export interface SortableStudent {
  profile: {
    user: {
      name: string | null;
      email: string;
    };
  };
}

export interface SortableAssignment {
  title: string | null;
  dueDate: Date | string | null;
  assignmentTypeId: string;
  assignmentType: { id: string; title: string };
}

const nameCollator = new Intl.Collator(undefined, {
  sensitivity: 'base',
  numeric: true,
});

export function compareStudentName<T extends SortableStudent>(
  a: T,
  b: T,
  direction: SortDirection
): number {
  const dir = direction === 'asc' ? 1 : -1;
  const nameA = a.profile.user.name ?? '';
  const nameB = b.profile.user.name ?? '';
  const primary = nameCollator.compare(nameA, nameB);
  if (primary !== 0) return primary * dir;
  return nameCollator.compare(a.profile.user.email, b.profile.user.email);
}

export function sortStudents<T extends SortableStudent>(
  students: readonly T[],
  direction: SortDirection
): T[] {
  return [...students].sort((a, b) => compareStudentName(a, b, direction));
}

function assignmentTitle(assignment: SortableAssignment): string {
  return assignment.title || 'Untitled Assignment';
}

function compareTitle(a: SortableAssignment, b: SortableAssignment): number {
  return nameCollator.compare(assignmentTitle(a), assignmentTitle(b));
}

function dueDateTime(assignment: SortableAssignment): number | null {
  if (!assignment.dueDate) return null;
  return new Date(assignment.dueDate).getTime();
}

function compareDueDateAsc(
  a: SortableAssignment,
  b: SortableAssignment
): number {
  const ta = dueDateTime(a);
  const tb = dueDateTime(b);
  // Missing due dates sink to the bottom regardless of direction.
  if (ta === null && tb === null) return 0;
  if (ta === null) return 1;
  if (tb === null) return -1;
  return ta - tb;
}

export function compareAssignments<T extends SortableAssignment>(
  a: T,
  b: T,
  sort: AssignmentSort
): number {
  const dir = sort.direction === 'asc' ? 1 : -1;
  if (sort.column === 'title') {
    const primary = compareTitle(a, b) * dir;
    if (primary !== 0) return primary;
    return compareDueDateAsc(a, b);
  }
  // Due date column: the "no due date" pile stays anchored at the bottom,
  // so we don't flip its sort when direction flips.
  const ta = dueDateTime(a);
  const tb = dueDateTime(b);
  if (ta === null && tb === null) return compareTitle(a, b);
  if (ta === null) return 1;
  if (tb === null) return -1;
  const primary = (ta - tb) * dir;
  if (primary !== 0) return primary;
  return compareTitle(a, b);
}

export function filterAssignmentsByType<T extends SortableAssignment>(
  assignments: readonly T[],
  selectedTypeIds: ReadonlySet<string>
): T[] {
  // An empty selection means "all" — never "none".
  if (selectedTypeIds.size === 0) return [...assignments];
  return assignments.filter((a) => selectedTypeIds.has(a.assignmentTypeId));
}

export function sortAssignments<T extends SortableAssignment>(
  assignments: readonly T[],
  sort: AssignmentSort
): T[] {
  return [...assignments].sort((a, b) => compareAssignments(a, b, sort));
}
