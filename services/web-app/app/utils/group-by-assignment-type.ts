export type AssignmentTypeGroup<T> = {
  /** The assignment type's id. */
  key: string;
  /** The assignment type's title, shown as the section heading. */
  label: string;
  items: T[];
};

/**
 * Splits a list of assignments into one group per assignment type, the way
 * the Documents page groups documents (`buildTeacherDocumentWorkGroups`):
 * groups ordered by their label with the same collator, rows inside a group
 * left in the order they came in, so whatever sort the table applied holds
 * within each section.
 */
export function groupByAssignmentType<T>(params: {
  items: T[];
  getAssignmentType: (item: T) => { id: string; title: string };
  collator: Intl.Collator;
}): AssignmentTypeGroup<T>[] {
  const groups = new Map<string, AssignmentTypeGroup<T>>();

  for (const item of params.items) {
    const type = params.getAssignmentType(item);
    const existing = groups.get(type.id);
    if (existing) {
      existing.items.push(item);
    } else {
      groups.set(type.id, { key: type.id, label: type.title, items: [item] });
    }
  }

  return Array.from(groups.values()).sort(
    (a, b) =>
      params.collator.compare(a.label, b.label) ||
      // Two types can share a title (one per organization); keep their order
      // stable rather than whatever order the rows happened to arrive in.
      (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)
  );
}
