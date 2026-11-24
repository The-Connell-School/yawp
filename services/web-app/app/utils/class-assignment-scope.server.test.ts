import { describe, expect, test } from 'bun:test';
import {
  buildClassStudentWorkOnAssignmentBranches,
  buildClassTeacherAssignmentTestDocumentBranch,
  buildTeacherClassWorkDocumentWhere,
} from './class-assignment-scope';
import { createdAtInSchoolYear } from './school-year';
import { HIDE_AP_HISTORY_DOCUMENT_WHERE } from './assignment-type-access.server';

describe('buildTeacherClassWorkDocumentWhere', () => {
  test('includes same-year assignmentless documents for students enrolled in teacher classes', () => {
    expect(
      buildTeacherClassWorkDocumentWhere({
        classIds: ['class-a', 'class-b'],
        classes: [
          { id: 'class-a', schoolYear: '2026-2027' },
          { id: 'class-b', schoolYear: '2026-2027' },
        ],
      })
    ).toEqual({
      deletedAt: null,
      OR: [{ archivedAt: null }, { submissions: { some: {} } }],
      AND: [
        {
          OR: [
            ...buildClassStudentWorkOnAssignmentBranches('class-a'),
            buildClassTeacherAssignmentTestDocumentBranch('class-a'),
            ...buildClassStudentWorkOnAssignmentBranches('class-b'),
            buildClassTeacherAssignmentTestDocumentBranch('class-b'),
            {
              classAssignmentId: null,
              ...createdAtInSchoolYear('2026-2027'),
              membership: {
                classesAsStudent: {
                  some: { id: { in: ['class-a', 'class-b'] } },
                },
              },
            },
          ],
        },
        HIDE_AP_HISTORY_DOCUMENT_WHERE,
      ],
    });
  });

  test('does not attach a prior-year unassigned document to a later-year class', () => {
    const where = buildTeacherClassWorkDocumentWhere({
      classIds: ['class-new'],
      classes: [{ id: 'class-new', schoolYear: '2026-2027' }],
    });
    const classScope = (where.AND as any)[0].OR;
    const assignmentless = classScope.filter(
      (branch: any) => branch.classAssignmentId === null
    );
    expect(assignmentless).toEqual([
      {
        classAssignmentId: null,
        ...createdAtInSchoolYear('2026-2027'),
        membership: {
          classesAsStudent: { some: { id: { in: ['class-new'] } } },
        },
      },
    ]);
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
            ...buildClassStudentWorkOnAssignmentBranches('class-a'),
            buildClassTeacherAssignmentTestDocumentBranch('class-a'),
            { id: { in: ['doc-legacy'] } },
          ],
        },
        HIDE_AP_HISTORY_DOCUMENT_WHERE,
      ],
    });
  });
});
