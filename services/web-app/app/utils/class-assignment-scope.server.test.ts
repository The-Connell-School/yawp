import { describe, expect, test } from 'bun:test';
import { HIDE_AP_HISTORY_DOCUMENT_WHERE } from '~/utils/assignment-type-access.server';
import {
  buildClassStudentWorkOnAssignmentBranches,
  buildClassTeacherAssignmentTestDocumentBranch,
  buildTeacherClassWorkDocumentWhere,
  teacherWorkListVisibilityWhere,
} from './class-assignment-scope';
import { createdAtInSchoolYear } from './school-year';

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
      ...teacherWorkListVisibilityWhere(),
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

  test('keeps archived submitted student work while excluding archived empty drafts', () => {
    expect(
      buildTeacherClassWorkDocumentWhere({
        classIds: ['class-a'],
      })
    ).toMatchObject({
      deletedAt: null,
      ...teacherWorkListVisibilityWhere(),
    });
  });

  test('excludes archived Try-it preview documents even when they have submissions', () => {
    const visibility = teacherWorkListVisibilityWhere();
    expect(visibility).toEqual({
      OR: [
        { archivedAt: null },
        {
          artifactKind: { not: 'TEACHER_ASSIGNMENT_PREVIEW' },
          submissions: { some: {} },
        },
      ],
    });

    const archivedPreviewWithSubmission = {
      archivedAt: new Date('2026-11-24T13:30:00.000Z'),
      artifactKind: 'TEACHER_ASSIGNMENT_PREVIEW' as const,
      hasSubmission: true,
    };
    const matchesVisibility = (doc: {
      archivedAt: Date | null;
      artifactKind: string;
      hasSubmission: boolean;
    }) =>
      doc.archivedAt === null ||
      (doc.artifactKind !== 'TEACHER_ASSIGNMENT_PREVIEW' && doc.hasSubmission);

    expect(matchesVisibility(archivedPreviewWithSubmission)).toBe(false);
    expect(
      matchesVisibility({
        archivedAt: new Date('2026-11-24T13:30:00.000Z'),
        artifactKind: 'STUDENT',
        hasSubmission: true,
      })
    ).toBe(true);
    expect(
      matchesVisibility({
        archivedAt: null,
        artifactKind: 'TEACHER_ASSIGNMENT_PREVIEW',
        hasSubmission: true,
      })
    ).toBe(true);
  });

  test('keeps legacy forensic documents in the all-class work scope', () => {
    expect(
      buildTeacherClassWorkDocumentWhere({
        classIds: ['class-a'],
        legacyDocumentIds: ['doc-legacy'],
      })
    ).toEqual({
      deletedAt: null,
      ...teacherWorkListVisibilityWhere(),
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
