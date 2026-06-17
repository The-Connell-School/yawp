import { describe, expect, test } from 'bun:test';
import { buildTeacherClassWorkDocumentWhere } from './class-assignment-scope.server';

describe('buildTeacherClassWorkDocumentWhere', () => {
  test('includes assignmentless documents for students enrolled in teacher classes', () => {
    expect(
      buildTeacherClassWorkDocumentWhere({
        classIds: ['class-a', 'class-b'],
      })
    ).toEqual({
      deletedAt: null,
      OR: [{ archivedAt: null }, { submissions: { some: {} } }],
      AND: [
        {
          OR: [
            {
              classAssignment: { classId: { in: ['class-a', 'class-b'] } },
            },
            {
              classAssignmentId: null,
              membership: {
                classesAsStudent: {
                  some: { id: { in: ['class-a', 'class-b'] } },
                },
              },
            },
          ],
        },
      ],
    });
  });

  test('keeps archived submitted work while excluding archived empty drafts', () => {
    expect(
      buildTeacherClassWorkDocumentWhere({
        classIds: ['class-a'],
      })
    ).toMatchObject({
      deletedAt: null,
      OR: [{ archivedAt: null }, { submissions: { some: {} } }],
    });
  });

  test('keeps legacy forensic documents in the all-class work scope', () => {
    expect(
      buildTeacherClassWorkDocumentWhere({
        classIds: ['class-a'],
        legacyDocumentIds: ['doc-legacy'],
      })
    ).toEqual({
      deletedAt: null,
      OR: [{ archivedAt: null }, { submissions: { some: {} } }],
      AND: [
        {
          OR: [
            { classAssignment: { classId: { in: ['class-a'] } } },
            {
              classAssignmentId: null,
              membership: {
                classesAsStudent: {
                  some: { id: { in: ['class-a'] } },
                },
              },
            },
            { id: { in: ['doc-legacy'] } },
          ],
        },
      ],
    });
  });
});
