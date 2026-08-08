import { describe, expect, test } from 'bun:test';

import {
  UNASSIGNED_CLASS_FILTER_ID,
  buildStudentAssignmentFilterOptions,
  buildStudentClassFilterOptions,
  filterStudentDocuments,
  hasActiveStudentDocumentFilters,
  parseStudentDocumentFilters,
  serializeStudentDocumentFilters,
  visibleStudentAssignmentOptions,
  type StudentDocumentFilterRow,
} from './student-document-filters';

const history = { id: 'class-history', grade: '9', period: '1', title: 'History' };
const english = { id: 'class-english', grade: '10', period: '2', title: 'English' };

type TestDocument = StudentDocumentFilterRow & { id: string };

function doc(overrides: Partial<TestDocument> & { id: string }): TestDocument {
  return {
    classAssignment: null,
    assignment: null,
    submissions: [],
    ...overrides,
  };
}

const documents: TestDocument[] = [
  doc({ id: 'free-write' }),
  doc({
    id: 'history-draft',
    classAssignment: { class: history },
    assignment: { id: 'a-dbq', title: 'DBQ' },
  }),
  doc({
    id: 'history-submitted',
    classAssignment: { class: history },
    assignment: { id: 'a-dbq', title: 'DBQ' },
    submissions: [{ id: 's1', releasedAt: null }],
  }),
  doc({
    id: 'english-graded',
    classAssignment: { class: english },
    assignment: { id: 'a-essay', title: 'Essay' },
    submissions: [{ id: 's2', releasedAt: new Date() }],
  }),
];

describe('parseStudentDocumentFilters', () => {
  test('defaults to no filters', () => {
    const filters = parseStudentDocumentFilters(new URLSearchParams());

    expect(filters).toEqual({ classIds: [], assignmentIds: [], status: 'all' });
  });

  test('reads the same URL vocabulary the teacher surface uses', () => {
    const filters = parseStudentDocumentFilters(
      new URLSearchParams('class=class-history,class-english&assignment=a-dbq&status=graded')
    );

    expect(filters).toEqual({
      classIds: ['class-history', 'class-english'],
      assignmentIds: ['a-dbq'],
      status: 'graded',
    });
  });

  test('falls back to all for a status that is not part of the student vocabulary', () => {
    // "needs-grading" is a teacher-only state; a hand-edited URL must not
    // silently render an empty page.
    expect(
      parseStudentDocumentFilters(new URLSearchParams('status=needs-grading'))
        .status
    ).toBe('all');
  });

  test('treats an explicit all as no id filter', () => {
    expect(
      parseStudentDocumentFilters(new URLSearchParams('class=all')).classIds
    ).toEqual([]);
  });

  test('round-trips through serialize', () => {
    const params = serializeStudentDocumentFilters({
      classIds: ['class-english', 'class-history'],
      assignmentIds: [],
      status: 'submitted',
    });

    expect(params.get('class')).toBe('class-english,class-history');
    expect(params.get('assignment')).toBeNull();
    expect(params.get('status')).toBe('submitted');
    expect(parseStudentDocumentFilters(params)).toEqual({
      classIds: ['class-english', 'class-history'],
      assignmentIds: [],
      status: 'submitted',
    });
  });

  test('serialize drops empty filters so a cleared view has a clean URL', () => {
    const params = serializeStudentDocumentFilters({
      classIds: [],
      assignmentIds: [],
      status: 'all',
    });

    expect(params.toString()).toBe('');
  });

  test('serialize preserves unrelated search params', () => {
    const params = serializeStudentDocumentFilters(
      { classIds: [], assignmentIds: [], status: 'all' },
      new URLSearchParams('exitTo=%2Fapp&status=graded')
    );

    expect(params.get('exitTo')).toBe('/app');
    expect(params.get('status')).toBeNull();
  });
});

describe('filterStudentDocuments', () => {
  test('returns everything when nothing is selected', () => {
    expect(
      filterStudentDocuments(documents, {
        classIds: [],
        assignmentIds: [],
        status: 'all',
      }).map((d) => d.id)
    ).toEqual(['free-write', 'history-draft', 'history-submitted', 'english-graded']);
  });

  test('filters by class', () => {
    expect(
      filterStudentDocuments(documents, {
        classIds: ['class-history'],
        assignmentIds: [],
        status: 'all',
      }).map((d) => d.id)
    ).toEqual(['history-draft', 'history-submitted']);
  });

  test('a class filter excludes documents not tied to a class', () => {
    expect(
      filterStudentDocuments(documents, {
        classIds: ['class-english'],
        assignmentIds: [],
        status: 'all',
      }).map((d) => d.id)
    ).toEqual(['english-graded']);
  });

  test('the unassigned sentinel selects documents with no class', () => {
    expect(
      filterStudentDocuments(documents, {
        classIds: [UNASSIGNED_CLASS_FILTER_ID],
        assignmentIds: [],
        status: 'all',
      }).map((d) => d.id)
    ).toEqual(['free-write']);
  });

  test('multiple classes union', () => {
    expect(
      filterStudentDocuments(documents, {
        classIds: ['class-english', UNASSIGNED_CLASS_FILTER_ID],
        assignmentIds: [],
        status: 'all',
      }).map((d) => d.id)
    ).toEqual(['free-write', 'english-graded']);
  });

  test('filters by assignment', () => {
    expect(
      filterStudentDocuments(documents, {
        classIds: [],
        assignmentIds: ['a-dbq'],
        status: 'all',
      }).map((d) => d.id)
    ).toEqual(['history-draft', 'history-submitted']);
  });

  test('an assignment filter excludes documents with no assignment', () => {
    expect(
      filterStudentDocuments(documents, {
        classIds: [],
        assignmentIds: ['a-essay'],
        status: 'all',
      }).map((d) => d.id)
    ).toEqual(['english-graded']);
  });

  test('filters by status', () => {
    expect(
      filterStudentDocuments(documents, {
        classIds: [],
        assignmentIds: [],
        status: 'in-progress',
      }).map((d) => d.id)
    ).toEqual(['free-write', 'history-draft']);

    expect(
      filterStudentDocuments(documents, {
        classIds: [],
        assignmentIds: [],
        status: 'submitted',
      }).map((d) => d.id)
    ).toEqual(['history-submitted']);

    expect(
      filterStudentDocuments(documents, {
        classIds: [],
        assignmentIds: [],
        status: 'graded',
      }).map((d) => d.id)
    ).toEqual(['english-graded']);
  });

  test('combines class, assignment, and status', () => {
    expect(
      filterStudentDocuments(documents, {
        classIds: ['class-history'],
        assignmentIds: ['a-dbq'],
        status: 'submitted',
      }).map((d) => d.id)
    ).toEqual(['history-submitted']);
  });

  test('a combination with no matches returns an empty list', () => {
    expect(
      filterStudentDocuments(documents, {
        classIds: ['class-history'],
        assignmentIds: [],
        status: 'graded',
      })
    ).toEqual([]);
  });

  test('preserves the incoming document order', () => {
    const reversed = [...documents].reverse();

    expect(
      filterStudentDocuments(reversed, {
        classIds: [],
        assignmentIds: [],
        status: 'all',
      }).map((d) => d.id)
    ).toEqual(reversed.map((d) => d.id));
  });
});

describe('buildStudentClassFilterOptions', () => {
  test('one option per class, labelled the way the class groups are', () => {
    expect(buildStudentClassFilterOptions(documents)).toEqual([
      { id: 'class-history', label: 'History · Grade 9 • Period 1' },
      { id: 'class-english', label: 'English · Grade 10 • Period 2' },
      { id: UNASSIGNED_CLASS_FILTER_ID, label: 'Not tied to a class' },
    ]);
  });

  test('omits the unassigned option when every document is tied to a class', () => {
    const options = buildStudentClassFilterOptions(
      documents.filter((d) => d.classAssignment !== null)
    );

    expect(options.map((option) => option.id)).toEqual([
      'class-history',
      'class-english',
    ]);
  });

  test('returns nothing for a student with no documents', () => {
    expect(buildStudentClassFilterOptions([])).toEqual([]);
  });
});

describe('buildStudentAssignmentFilterOptions', () => {
  test('dedupes assignments and carries the classes they belong to', () => {
    expect(buildStudentAssignmentFilterOptions(documents)).toEqual([
      { id: 'a-dbq', label: 'DBQ', classIds: ['class-history'] },
      { id: 'a-essay', label: 'Essay', classIds: ['class-english'] },
    ]);
  });

  test('an assignment used in two classes carries both', () => {
    const options = buildStudentAssignmentFilterOptions([
      doc({
        id: 'a',
        classAssignment: { class: history },
        assignment: { id: 'a-dbq', title: 'DBQ' },
      }),
      doc({
        id: 'b',
        classAssignment: { class: english },
        assignment: { id: 'a-dbq', title: 'DBQ' },
      }),
    ]);

    expect(options).toEqual([
      { id: 'a-dbq', label: 'DBQ', classIds: ['class-history', 'class-english'] },
    ]);
  });

  test('falls back to a readable label for an untitled assignment', () => {
    expect(
      buildStudentAssignmentFilterOptions([
        doc({ id: 'a', assignment: { id: 'a-1', title: null } }),
      ])
    ).toEqual([{ id: 'a-1', label: 'Untitled assignment', classIds: [] }]);
  });
});

describe('visibleStudentAssignmentOptions', () => {
  const options = buildStudentAssignmentFilterOptions(documents);

  test('shows every assignment when no class is selected', () => {
    expect(visibleStudentAssignmentOptions(options, []).map((o) => o.id)).toEqual(
      ['a-dbq', 'a-essay']
    );
  });

  test('narrows to the assignments in the selected class', () => {
    expect(
      visibleStudentAssignmentOptions(options, ['class-english']).map((o) => o.id)
    ).toEqual(['a-essay']);
  });

  test('the unassigned bucket has no assignments', () => {
    expect(
      visibleStudentAssignmentOptions(options, [UNASSIGNED_CLASS_FILTER_ID])
    ).toEqual([]);
  });
});

describe('hasActiveStudentDocumentFilters', () => {
  test('is false when nothing is selected', () => {
    expect(
      hasActiveStudentDocumentFilters({
        classIds: [],
        assignmentIds: [],
        status: 'all',
      })
    ).toBe(false);
  });

  test('is true for any selection', () => {
    expect(
      hasActiveStudentDocumentFilters({
        classIds: [],
        assignmentIds: [],
        status: 'graded',
      })
    ).toBe(true);
    expect(
      hasActiveStudentDocumentFilters({
        classIds: ['class-history'],
        assignmentIds: [],
        status: 'all',
      })
    ).toBe(true);
    expect(
      hasActiveStudentDocumentFilters({
        classIds: [],
        assignmentIds: ['a-dbq'],
        status: 'all',
      })
    ).toBe(true);
  });
});
