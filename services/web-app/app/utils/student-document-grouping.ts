import { formatClassLabel } from './teacher-document-work-utils';

export type StudentDocumentGroupingClass = {
  id: string;
  grade: string;
  period: string;
  title: string | null;
};

export type StudentDocumentGroupingRow = {
  id: string;
  classAssignment: { class: StudentDocumentGroupingClass } | null;
};

export type StudentDocumentGroup<T extends StudentDocumentGroupingRow> = {
  classId: string | null;
  label: string;
  klass: StudentDocumentGroupingClass | null;
  documents: T[];
};

export const UNASSIGNED_LABEL = 'Not tied to a class';

/**
 * Groups a student's documents by the class their assignment belongs to,
 * preserving document order within each group. Documents with no
 * classAssignment (freeform/practice writing not tied to a class) are
 * bucketed under a single "Not tied to a class" group, always last.
 */
export function groupStudentDocumentsByClass<
  T extends StudentDocumentGroupingRow,
>(documents: T[]): StudentDocumentGroup<T>[] {
  const groups = new Map<string, StudentDocumentGroup<T>>();

  for (const document of documents) {
    const klass = document.classAssignment?.class ?? null;
    const key = klass?.id ?? '__unassigned__';

    const existing = groups.get(key);
    if (existing) {
      existing.documents.push(document);
      continue;
    }

    groups.set(key, {
      classId: klass?.id ?? null,
      label: klass ? formatClassLabel(klass) : UNASSIGNED_LABEL,
      klass,
      documents: [document],
    });
  }

  const ordered = Array.from(groups.values());
  const classGroups = ordered.filter((group) => group.classId !== null);
  const unassignedGroup = ordered.find((group) => group.classId === null);

  return unassignedGroup ? [...classGroups, unassignedGroup] : classGroups;
}
