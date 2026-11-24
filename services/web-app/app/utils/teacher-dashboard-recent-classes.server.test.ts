import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  document: { findMany: mock() },
  documentClassForensic: { findMany: mock() },
};

mock.module('~/utils/db.server.js', () => ({ prisma }));
mock.module('~/utils/db.server', () => ({ prisma }));

const {
  TEACHER_DASHBOARD_RECENT_CLASS_LIMIT,
  getTeacherRecentActiveClassIds,
  resolveDocumentClassIds,
} = await import('./teacher-dashboard-recent-classes.server');

describe('resolveDocumentClassIds', () => {
  const teacherClassIdSet = new Set(['class-a', 'class-b', 'class-c']);

  test('uses class assignment deployment when the document is assignment-backed', () => {
    expect(
      resolveDocumentClassIds({
        documentId: 'doc-1',
        document: {
          classAssignmentId: 'ca-1',
          classAssignment: { classId: 'class-a' },
          assignmentId: 'assignment-1',
          createdAt: new Date('2026-02-06T00:00:00.000Z'),
          membership: { classesAsStudent: [{ id: 'class-b' }] },
        },
        teacherClassIdSet,
        forensicClassIdByDocumentId: new Map(),
      })
    ).toEqual(['class-a']);
  });

  test('attributes unassigned documents to same-year enrolled teacher classes', () => {
    expect(
      resolveDocumentClassIds({
        documentId: 'doc-2',
        document: {
          classAssignmentId: null,
          classAssignment: null,
          assignmentId: null,
          createdAt: new Date('2026-02-06T00:00:00.000Z'),
          membership: {
            classesAsStudent: [{ id: 'class-a' }, { id: 'class-b' }],
          },
        },
        teacherClassIdSet,
        teacherClassYears: new Map([
          ['class-a', '2025-2026'],
          ['class-b', '2025-2026'],
        ]),
        forensicClassIdByDocumentId: new Map(),
      })
    ).toEqual(['class-a', 'class-b']);
  });

  test('does not attribute a prior-year unassigned document to a new-year class', () => {
    expect(
      resolveDocumentClassIds({
        documentId: 'doc-2',
        document: {
          classAssignmentId: null,
          classAssignment: null,
          assignmentId: null,
          createdAt: new Date('2026-02-06T00:00:00.000Z'),
          membership: {
            classesAsStudent: [{ id: 'class-a' }, { id: 'class-b' }],
          },
        },
        teacherClassIdSet,
        teacherClassYears: new Map([
          ['class-a', '2025-2026'],
          ['class-b', '2026-2027'],
        ]),
        forensicClassIdByDocumentId: new Map(),
      })
    ).toEqual(['class-a']);
  });

  test('uses forensic and enrollment class linkage for legacy documents', () => {
    expect(
      resolveDocumentClassIds({
        documentId: 'doc-legacy',
        document: {
          classAssignmentId: null,
          classAssignment: null,
          assignmentId: null,
          createdAt: new Date('2026-02-06T00:00:00.000Z'),
          membership: { classesAsStudent: [{ id: 'class-b' }] },
        },
        teacherClassIdSet,
        teacherClassYears: new Map([
          ['class-b', '2025-2026'],
          ['class-c', '2025-2026'],
        ]),
        forensicClassIdByDocumentId: new Map([['doc-legacy', 'class-c']]),
      }).sort()
    ).toEqual(['class-b', 'class-c']);
  });
});

describe('getTeacherRecentActiveClassIds', () => {
  beforeEach(() => {
    prisma.document.findMany.mockReset();
    prisma.documentClassForensic.findMany.mockReset();
    prisma.documentClassForensic.findMany.mockResolvedValue([]);
  });

  test('returns the six most recently active classes and excludes inactive ones', async () => {
    const classIds = [
      'class-1',
      'class-2',
      'class-3',
      'class-4',
      'class-5',
      'class-6',
      'class-7',
      'class-8',
    ];

    prisma.document.findMany.mockResolvedValue([
      {
        id: 'doc-8',
        updatedAt: new Date('2026-06-12T12:00:00.000Z'),
        classAssignmentId: 'ca-8',
        classAssignment: { classId: 'class-8' },
        assignmentId: 'assignment-8',
        membership: { classesAsStudent: [{ id: 'class-8' }] },
      },
      {
        id: 'doc-7',
        updatedAt: new Date('2026-06-11T12:00:00.000Z'),
        classAssignmentId: 'ca-7',
        classAssignment: { classId: 'class-7' },
        assignmentId: 'assignment-7',
        membership: { classesAsStudent: [{ id: 'class-7' }] },
      },
      {
        id: 'doc-6',
        updatedAt: new Date('2026-06-10T12:00:00.000Z'),
        classAssignmentId: 'ca-6',
        classAssignment: { classId: 'class-6' },
        assignmentId: 'assignment-6',
        membership: { classesAsStudent: [{ id: 'class-6' }] },
      },
      {
        id: 'doc-5',
        updatedAt: new Date('2026-06-09T12:00:00.000Z'),
        classAssignmentId: 'ca-5',
        classAssignment: { classId: 'class-5' },
        assignmentId: 'assignment-5',
        membership: { classesAsStudent: [{ id: 'class-5' }] },
      },
      {
        id: 'doc-4',
        updatedAt: new Date('2026-06-08T12:00:00.000Z'),
        classAssignmentId: 'ca-4',
        classAssignment: { classId: 'class-4' },
        assignmentId: 'assignment-4',
        membership: { classesAsStudent: [{ id: 'class-4' }] },
      },
      {
        id: 'doc-3',
        updatedAt: new Date('2026-06-07T12:00:00.000Z'),
        classAssignmentId: 'ca-3',
        classAssignment: { classId: 'class-3' },
        assignmentId: 'assignment-3',
        membership: { classesAsStudent: [{ id: 'class-3' }] },
      },
      {
        id: 'doc-2',
        updatedAt: new Date('2026-06-06T12:00:00.000Z'),
        classAssignmentId: 'ca-2',
        classAssignment: { classId: 'class-2' },
        assignmentId: 'assignment-2',
        membership: { classesAsStudent: [{ id: 'class-2' }] },
      },
      {
        id: 'doc-1',
        updatedAt: new Date('2026-06-05T12:00:00.000Z'),
        classAssignmentId: 'ca-1',
        classAssignment: { classId: 'class-1' },
        assignmentId: 'assignment-1',
        membership: { classesAsStudent: [{ id: 'class-1' }] },
      },
    ]);

    const recentClassIds = await getTeacherRecentActiveClassIds({
      teacherClassIds: classIds,
    });

    expect(recentClassIds).toEqual([
      'class-8',
      'class-7',
      'class-6',
      'class-5',
      'class-4',
      'class-3',
    ]);
    expect(recentClassIds).toHaveLength(
      TEACHER_DASHBOARD_RECENT_CLASS_LIMIT
    );
  });

  test('scopes document lookup to the teacher classes and student document progress', async () => {
    prisma.document.findMany.mockResolvedValue([]);

    await getTeacherRecentActiveClassIds({
      teacherClassIds: ['class-a', 'class-b'],
      classes: [
        { id: 'class-a', schoolYear: '2026-2027' },
        { id: 'class-b', schoolYear: '2026-2027' },
      ],
    });

    expect(prisma.document.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          deletedAt: null,
          OR: expect.arrayContaining([
            { classAssignment: { classId: { in: ['class-a', 'class-b'] } } },
            {
              classAssignmentId: null,
              assignmentId: null,
              createdAt: {
                gte: new Date(Date.UTC(2026, 6, 1)),
                lt: new Date(Date.UTC(2027, 6, 1)),
              },
              membership: {
                classesAsStudent: { some: { id: { in: ['class-a', 'class-b'] } } },
              },
            },
          ]),
        }),
        orderBy: { updatedAt: 'desc' },
      })
    );
  });
});
