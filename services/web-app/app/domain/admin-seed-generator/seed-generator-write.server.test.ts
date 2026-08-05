import { describe, expect, mock, test } from 'bun:test';
import type { SeedCommitProposal } from './seed-generator-schema';

// resolveApprovedSeedItems is pure (no I/O), but the module also exports
// commitApprovedSeedData, which imports ~/utils/auth.server (and, through
// it, ~/utils/db.server -- a real PrismaClient constructed at import time).
// Mirror the mocking pattern in app/domain/reporter/reporter-tools.server.test.ts
// so importing this module doesn't require a live DATABASE_URL.
mock.module('~/utils/db.server', () => ({ prisma: {} }));
mock.module('~/utils/auth.server', () => ({
  getPasswordHash: mock(async () => 'hashed'),
}));

const { resolveApprovedSeedItems } = await import('./seed-generator-write.server');

function baseProposal(overrides: Partial<SeedCommitProposal> = {}): SeedCommitProposal {
  return {
    classes: [
      {
        localId: 'class-1',
        title: 'English 9',
        grade: '9',
        period: '3',
        schoolYear: '2025-2026',
        approved: true,
      },
    ],
    assignments: [
      {
        localId: 'assignment-1',
        classLocalId: 'class-1',
        title: 'Civic essay',
        prompt: 'Write about civic responsibility.',
        assignmentTypeTitle: 'The Thesis-Driven Essay',
        approved: true,
      },
    ],
    students: [
      {
        localId: 'student-1',
        name: 'Maya R.',
        classLocalId: 'class-1',
        writingProfile: 'struggling',
        submissions: [
          {
            localId: 'submission-1',
            assignmentLocalId: 'assignment-1',
            essayText: 'Some struggling essay text.',
            status: 'submitted',
          },
        ],
        approved: true,
      },
      {
        localId: 'student-2',
        name: 'Sam T.',
        classLocalId: 'class-1',
        writingProfile: 'on_track',
        submissions: [
          {
            localId: 'submission-2',
            assignmentLocalId: 'assignment-1',
            essayText: 'Some on-track essay text.',
            status: 'draft',
          },
        ],
        approved: false, // rejected
      },
    ],
    ...overrides,
  };
}

const ctx = {
  existingClassIds: new Set<string>(),
  assignmentTypeIdByTitle: new Map([['The Thesis-Driven Essay', 'type-1']]),
};

describe('resolveApprovedSeedItems', () => {
  test('only approved classes/assignments/students are included', () => {
    const result = resolveApprovedSeedItems(baseProposal(), ctx);
    expect(result.approvedClasses.map((c) => c.localId)).toEqual(['class-1']);
    expect(result.approvedAssignments.map((a) => a.localId)).toEqual(['assignment-1']);
    expect(result.approvedStudents.map(({ student }) => student.localId)).toEqual(['student-1']);
  });

  test('a rejected student never appears in approvedStudents, even with a valid class/assignment', () => {
    const result = resolveApprovedSeedItems(baseProposal(), ctx);
    expect(result.approvedStudents.some(({ student }) => student.localId === 'student-2')).toBe(
      false
    );
  });

  test('rejecting the class also drops a student who referenced it', () => {
    const proposal = baseProposal({
      classes: [
        {
          localId: 'class-1',
          title: 'English 9',
          grade: '9',
          period: '3',
          schoolYear: '2025-2026',
          approved: false, // class rejected
        },
      ],
    });
    const result = resolveApprovedSeedItems(proposal, ctx);
    expect(result.approvedClasses).toHaveLength(0);
    expect(result.approvedStudents).toHaveLength(0);
    expect(result.skippedStudents.map((s) => s.localId)).toContain('student-1');
  });

  test('an assignment referencing a disabled assignment type is dropped, and students left with zero valid submissions are dropped', () => {
    const proposal = baseProposal();
    const ctxWithNoTypes = {
      existingClassIds: new Set<string>(),
      assignmentTypeIdByTitle: new Map<string, string>(), // nothing enabled
    };
    const result = resolveApprovedSeedItems(proposal, ctxWithNoTypes);
    expect(result.approvedAssignments).toHaveLength(0);
    expect(result.approvedStudents).toHaveLength(0);
    expect(result.skippedStudents.map((s) => s.localId)).toContain('student-1');
  });

  test('a student may reference an existing class id instead of a proposed one', () => {
    const proposal: SeedCommitProposal = {
      classes: [],
      assignments: [
        {
          localId: 'assignment-1',
          classLocalId: 'existing-class-9',
          title: 'Civic essay',
          prompt: 'Write about civic responsibility.',
          assignmentTypeTitle: 'The Thesis-Driven Essay',
          approved: true,
        },
      ],
      students: [
        {
          localId: 'student-1',
          name: 'Maya R.',
          classLocalId: 'existing-class-9',
          writingProfile: 'struggling',
          submissions: [
            {
              localId: 'submission-1',
              assignmentLocalId: 'assignment-1',
              essayText: 'essay text',
              status: 'submitted',
            },
          ],
          approved: true,
        },
      ],
    };
    const result = resolveApprovedSeedItems(proposal, {
      existingClassIds: new Set(['existing-class-9']),
      assignmentTypeIdByTitle: new Map([['The Thesis-Driven Essay', 'type-1']]),
    });
    expect(result.approvedStudents).toHaveLength(1);
    expect(result.approvedStudents[0]?.classRef).toEqual({
      kind: 'existing',
      id: 'existing-class-9',
    });
  });

  test('an unresolved class reference (a typo in the id) is skipped, not silently dropped without record', () => {
    const proposal = baseProposal({
      students: [
        {
          localId: 'student-1',
          name: 'Maya R.',
          classLocalId: 'no-such-class',
          writingProfile: 'struggling',
          submissions: [
            {
              localId: 'submission-1',
              assignmentLocalId: 'assignment-1',
              essayText: 'essay text',
              status: 'submitted',
            },
          ],
          approved: true,
        },
      ],
    });
    const result = resolveApprovedSeedItems(proposal, ctx);
    expect(result.approvedStudents).toHaveLength(0);
    expect(result.skippedStudents).toHaveLength(1);
    expect(result.skippedStudents[0]?.reason).toMatch(/unresolved or unapproved class/);
  });
});
