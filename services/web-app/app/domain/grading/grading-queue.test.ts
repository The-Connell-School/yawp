import { describe, expect, test } from 'bun:test';
import {
  GRADING_QUEUE_SORT_PARAM,
  buildGradingQueue,
  buildGradingQueueHref,
  parseGradingQueueScope,
  parseGradingQueueSort,
  resolveGradingQueueNeighbors,
  serializeGradingQueueSort,
} from './grading-queue';
import type { TeacherDocumentWorkRow } from '~/utils/teacher-document-work-utils';

type DocOptions = {
  id: string;
  studentName: string;
  membershipId?: string;
  submissionId?: string | null;
  classId?: string | null;
  assignmentId?: string | null;
  title?: string | null;
  updatedAt?: string;
  releasedAt?: string | null;
  gradedAt?: string | null;
};

function doc(options: DocOptions): TeacherDocumentWorkRow {
  const membershipId = options.membershipId ?? `m-${options.id}`;
  const submissionId =
    options.submissionId === undefined ? `sub-${options.id}` : options.submissionId;
  const submission = submissionId
    ? {
        id: submissionId,
        title: options.title ?? 'Essay',
        submittedAt: new Date('2026-08-01T00:00:00Z'),
        createdAt: new Date('2026-08-01T00:00:00Z'),
        releasedAt: options.releasedAt ? new Date(options.releasedAt) : null,
        gradedAt: options.gradedAt ? new Date(options.gradedAt) : null,
        archivedAt: null,
        score: null,
        feedback: null,
        rubricScores: null,
        overallComment: null,
        numericPercentage: null,
        letterGrade: null,
      }
    : null;

  return {
    id: options.id,
    title: options.title ?? 'Essay',
    updatedAt: new Date(options.updatedAt ?? '2026-08-01T00:00:00Z'),
    membership: {
      id: membershipId,
      user: {
        id: `u-${membershipId}`,
        name: options.studentName,
        email: `${options.studentName.toLowerCase().replace(/\s+/g, '.')}@school.test`,
      },
    },
    group: null,
    assignment: options.assignmentId
      ? { id: options.assignmentId, title: 'Narrative', submitForGrade: true, pointValue: 100 }
      : null,
    resolvedClass:
      options.classId === null
        ? null
        : {
            id: options.classId ?? 'class-1',
            grade: '9',
            period: '2',
            title: 'English 9',
          },
    submissions: submission ? [submission] : [],
    latestSubmission: submission,
    submissionCount: submission ? 1 : 0,
  } as TeacherDocumentWorkRow;
}

describe('parseGradingQueueScope', () => {
  test('reads the documents work list and its filters', () => {
    const scope = parseGradingQueueScope(
      '/app/documents?status=needs-grading&class=class-1,class-2&student=s-1&assignment=a-9&q=hamlet'
    );

    expect(scope).toEqual({
      kind: 'documents',
      classId: null,
      filters: {
        studentIds: ['s-1'],
        classIds: ['class-1', 'class-2'],
        assignmentIds: ['a-9'],
        classAssignmentIds: [],
        status: 'needs-grading',
        query: 'hamlet',
      },
    });
  });

  test('reads the class work list under its own param names', () => {
    const scope = parseGradingQueueScope(
      '/app/my-classes/class-7?tab=documents&status=graded&studentId=s-3&classAssignmentId=ca-1'
    );

    expect(scope?.kind).toBe('class');
    expect(scope?.classId).toBe('class-7');
    expect(scope?.filters.classIds).toEqual(['class-7']);
    expect(scope?.filters.studentIds).toEqual(['s-3']);
    expect(scope?.filters.classAssignmentIds).toEqual(['ca-1']);
    expect(scope?.filters.status).toBe('graded');
  });

  test('ignores a class page opened on another tab', () => {
    expect(
      parseGradingQueueScope('/app/my-classes/class-7?tab=roster')
    ).toBeNull();
  });

  test('treats an unknown status as no status filter', () => {
    expect(
      parseGradingQueueScope('/app/documents?status=bogus')?.filters.status
    ).toBe('all');
  });

  test('returns null for anything that is not a teacher work list', () => {
    expect(parseGradingQueueScope(null)).toBeNull();
    expect(parseGradingQueueScope('')).toBeNull();
    expect(parseGradingQueueScope('/app')).toBeNull();
    expect(parseGradingQueueScope('/app/my-documents')).toBeNull();
    expect(parseGradingQueueScope('https://evil.test/app/documents')).toBeNull();
    expect(parseGradingQueueScope('//evil.test/app/documents')).toBeNull();
  });
});

describe('grading queue sort round-trip', () => {
  test('serializes and parses', () => {
    expect(serializeGradingQueueSort({ field: 'student', direction: 'asc' })).toBe(
      'student:asc'
    );
    expect(parseGradingQueueSort('student:asc')).toEqual({
      field: 'student',
      direction: 'asc',
    });
  });

  test('rejects unknown fields and directions', () => {
    expect(parseGradingQueueSort('nonsense:asc')).toBeNull();
    expect(parseGradingQueueSort('student:sideways')).toBeNull();
    expect(parseGradingQueueSort(null)).toBeNull();
  });
});

describe('buildGradingQueue', () => {
  const documents = [
    doc({ id: 'd1', studentName: 'Ana Reyes', updatedAt: '2026-08-03T00:00:00Z' }),
    doc({ id: 'd2', studentName: 'Ben Cole', updatedAt: '2026-08-02T00:00:00Z' }),
    doc({ id: 'd3', studentName: 'Cara Diaz', updatedAt: '2026-08-01T00:00:00Z' }),
  ];

  test('orders the queue by the list sort', () => {
    const queue = buildGradingQueue({
      documents,
      scope: parseGradingQueueScope('/app/documents')!,
      sort: { field: 'student', direction: 'asc' },
    });

    expect(queue.map((entry) => entry.studentName)).toEqual([
      'Ana Reyes',
      'Ben Cole',
      'Cara Diaz',
    ]);
    expect(queue[0].submissionId).toBe('sub-d1');
  });

  test('defaults to the list default sort of last edited, newest first', () => {
    const queue = buildGradingQueue({
      documents: [documents[2], documents[0], documents[1]],
      scope: parseGradingQueueScope('/app/documents')!,
    });

    expect(queue.map((entry) => entry.studentName)).toEqual([
      'Ana Reyes',
      'Ben Cole',
      'Cara Diaz',
    ]);
  });

  test('drops drafts that have nothing submitted to grade', () => {
    const queue = buildGradingQueue({
      documents: [...documents, doc({ id: 'd4', studentName: 'Dev Patel', submissionId: null })],
      scope: parseGradingQueueScope('/app/documents')!,
    });

    expect(queue.map((entry) => entry.documentId)).not.toContain('d4');
  });

  test('honours the status filter the teacher had applied', () => {
    const queue = buildGradingQueue({
      documents: [
        doc({ id: 'd1', studentName: 'Ana Reyes' }),
        doc({ id: 'd2', studentName: 'Ben Cole', releasedAt: '2026-08-05T00:00:00Z' }),
      ],
      scope: parseGradingQueueScope('/app/documents?status=needs-grading')!,
    });

    expect(queue.map((entry) => entry.studentName)).toEqual(['Ana Reyes']);
  });

  test('honours class, assignment and free-text filters', () => {
    const pool = [
      doc({ id: 'd1', studentName: 'Ana Reyes', classId: 'class-1', assignmentId: 'a-1' }),
      doc({ id: 'd2', studentName: 'Ben Cole', classId: 'class-2', assignmentId: 'a-1' }),
      doc({ id: 'd3', studentName: 'Cara Diaz', classId: 'class-1', assignmentId: 'a-2' }),
    ];

    expect(
      buildGradingQueue({
        documents: pool,
        scope: parseGradingQueueScope('/app/documents?class=class-1')!,
      }).map((entry) => entry.studentName)
    ).toEqual(['Ana Reyes', 'Cara Diaz']);

    expect(
      buildGradingQueue({
        documents: pool,
        scope: parseGradingQueueScope('/app/documents?assignment=a-1')!,
      }).map((entry) => entry.studentName)
    ).toEqual(['Ana Reyes', 'Ben Cole']);

    expect(
      buildGradingQueue({
        documents: pool,
        scope: parseGradingQueueScope('/app/documents?q=cara')!,
      }).map((entry) => entry.studentName)
    ).toEqual(['Cara Diaz']);
  });

  test('keeps the open paper in the queue after its grade is released', () => {
    // The teacher is standing on Ben, filtered to "Needs Grading". Releasing
    // Ben's grade must not strand them with no way to reach Cara.
    const queue = buildGradingQueue({
      documents: [
        doc({ id: 'd1', studentName: 'Ana Reyes', updatedAt: '2026-08-03T00:00:00Z' }),
        doc({
          id: 'd2',
          studentName: 'Ben Cole',
          updatedAt: '2026-08-02T00:00:00Z',
          releasedAt: '2026-08-06T00:00:00Z',
        }),
        doc({ id: 'd3', studentName: 'Cara Diaz', updatedAt: '2026-08-01T00:00:00Z' }),
      ],
      scope: parseGradingQueueScope('/app/documents?status=needs-grading')!,
      pinnedSubmissionId: 'sub-d2',
    });

    expect(queue.map((entry) => entry.studentName)).toEqual([
      'Ana Reyes',
      'Ben Cole',
      'Cara Diaz',
    ]);
    expect(queue[1].status).toBe('released');
  });

  test('does not pin a paper that falls outside the list scope entirely', () => {
    const queue = buildGradingQueue({
      documents: [
        doc({ id: 'd1', studentName: 'Ana Reyes', classId: 'class-1' }),
        doc({ id: 'd2', studentName: 'Ben Cole', classId: 'class-2' }),
      ],
      scope: parseGradingQueueScope('/app/documents?class=class-1')!,
      pinnedSubmissionId: 'sub-d2',
    });

    expect(queue.map((entry) => entry.studentName)).toEqual(['Ana Reyes']);
  });
});

describe('resolveGradingQueueNeighbors', () => {
  const queue = buildGradingQueue({
    documents: [
      doc({ id: 'd1', studentName: 'Ana Reyes', updatedAt: '2026-08-03T00:00:00Z' }),
      doc({ id: 'd2', studentName: 'Ben Cole', updatedAt: '2026-08-02T00:00:00Z' }),
      doc({ id: 'd3', studentName: 'Cara Diaz', updatedAt: '2026-08-01T00:00:00Z' }),
    ],
    scope: parseGradingQueueScope('/app/documents')!,
  });

  test('reports both neighbours and the teacher position in the stack', () => {
    const middle = resolveGradingQueueNeighbors({ queue, submissionId: 'sub-d2' });

    expect(middle?.previous?.studentName).toBe('Ana Reyes');
    expect(middle?.next?.studentName).toBe('Cara Diaz');
    expect(middle?.position).toBe(2);
    expect(middle?.total).toBe(3);
  });

  test('has no previous at the top and no next at the bottom', () => {
    expect(
      resolveGradingQueueNeighbors({ queue, submissionId: 'sub-d1' })?.previous
    ).toBeNull();
    expect(
      resolveGradingQueueNeighbors({ queue, submissionId: 'sub-d3' })?.next
    ).toBeNull();
  });

  test('returns null when the open paper is not in the queue', () => {
    expect(
      resolveGradingQueueNeighbors({ queue, submissionId: 'sub-elsewhere' })
    ).toBeNull();
  });
});

describe('buildGradingQueueHref', () => {
  test('carries the exit target and sort forward so the queue survives the hop', () => {
    const href = buildGradingQueueHref({
      submissionId: 'sub-9',
      exitTo: '/app/documents?status=needs-grading',
      sort: { field: 'student', direction: 'asc' },
    });

    const url = new URL(href, 'https://yawp.invalid');
    expect(url.pathname).toBe('/app/submissions/sub-9');
    expect(url.searchParams.get('edit')).toBe('1');
    expect(url.searchParams.get('exitTo')).toBe(
      '/app/documents?status=needs-grading'
    );
    expect(url.searchParams.get(GRADING_QUEUE_SORT_PARAM)).toBe('student:asc');
  });

  test('omits the sort when the list was not explicitly sorted', () => {
    const href = buildGradingQueueHref({
      submissionId: 'sub-9',
      exitTo: '/app/documents',
      sort: null,
    });

    expect(href).not.toContain(GRADING_QUEUE_SORT_PARAM);
  });
});
