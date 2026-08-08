import { describe, expect, test } from 'bun:test';
import { groupStudentDocumentsByClass } from './student-document-grouping';

function doc(
  id: string,
  classAssignment: { class: { id: string; grade: string; period: string; title: string | null } } | null
) {
  return { id, classAssignment } as any;
}

describe('groupStudentDocumentsByClass', () => {
  test('groups documents under their class, most recently touched class first', () => {
    const groups = groupStudentDocumentsByClass([
      doc('doc-english', {
        class: { id: 'class-english', grade: '9', period: '2', title: 'English' },
      }),
      doc('doc-history', {
        class: { id: 'class-history', grade: '9', period: '1', title: 'History' },
      }),
      doc('doc-english-2', {
        class: { id: 'class-english', grade: '9', period: '2', title: 'English' },
      }),
    ]);

    expect(groups.map((g) => g.classId)).toEqual(['class-english', 'class-history']);
    expect(groups[0].label).toBe('English · Grade 9 • Period 2');
    expect(groups[0].documents.map((d) => d.id)).toEqual([
      'doc-english',
      'doc-english-2',
    ]);
  });

  test('buckets documents with no class assignment (e.g. free-write practice) under Unassigned, sorted last', () => {
    const groups = groupStudentDocumentsByClass([
      doc('doc-practice', null),
      doc('doc-history', {
        class: { id: 'class-history', grade: '9', period: '1', title: 'History' },
      }),
    ]);

    expect(groups.map((g) => g.classId)).toEqual(['class-history', null]);
    expect(groups[1].label).toBe('Not tied to a class');
    expect(groups[1].documents.map((d) => d.id)).toEqual(['doc-practice']);
  });

  test('returns an empty array for no documents', () => {
    expect(groupStudentDocumentsByClass([])).toEqual([]);
  });
});
