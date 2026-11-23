import { describe, expect, mock, test, beforeEach } from 'bun:test';

const tx = {
  assignment: {
    create: mock(),
    findFirst: mock(),
    findUnique: mock(),
    update: mock(),
  },
  classAssignment: {
    createMany: mock(),
    findMany: mock(),
    deleteMany: mock(),
  },
  class: { findMany: mock() },
  document: { findFirst: mock() },
  $queryRaw: mock().mockResolvedValue([{ id: 'locked' }]),
};

mock.module('~/utils/db.server', () => ({
  prisma: {
    $transaction: async (fn: (client: typeof tx) => unknown) => fn(tx),
  },
}));

mock.module('~/utils/assignment-quota.server', () => ({
  enforceFreeClassroomAssignmentCreateInTransaction: mock(),
  enforceFreeClassroomAssignmentRetypeInTransaction: mock(),
}));

mock.module('~/domain/feature-flags/feature-flags.server', () => ({
  isFeatureFlagEnabled: mock().mockResolvedValue(false),
}));

mock.module('~/dev-panel/class-simulation.server', () => ({
  applyDevPanelSimulationForNewClassAssignments: mock().mockResolvedValue(undefined),
}));

mock.module('~/domain/rubrics/rubric-release.server', () => ({
  shouldUseInternalRubricRelease: mock().mockResolvedValue(false),
  findReleasedRubricRevisionId: mock(),
}));

const {
  AssignmentClassChangeError,
  changeAssignmentClasses,
  createAssignmentDeployedToClasses,
  planAssignmentClassChange,
  updateAssignmentInClassDeployment,
} = await import('./assignment-deployment.server');

describe('createAssignmentDeployedToClasses', () => {
  beforeEach(() => {
    tx.assignment.create.mockReset();
    tx.classAssignment.createMany.mockReset();
  });

  test('persists solo collaboration settings even when create data requests collaboration', async () => {
    tx.assignment.create.mockResolvedValue({ id: 'a-1' });

    await createAssignmentDeployedToClasses({
      data: {
        assignmentTypeId: 'type-1',
        prompt: 'Write.',
        collaborationEnabled: true,
        collaborationGroupMode: 'random',
        collaborationGroupSize: 4,
      },
      classIds: [],
    });

    expect(tx.assignment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        collaborationEnabled: false,
        collaborationGroupMode: 'teacher',
        collaborationGroupSize: null,
      }),
    });
  });
});

describe('updateAssignmentInClassDeployment', () => {
  beforeEach(() => {
    tx.assignment.findFirst.mockReset();
    tx.assignment.update.mockReset();
  });

  test('drops collaboration fields when updating a solo assignment', async () => {
    tx.assignment.findFirst.mockResolvedValue({
      id: 'a-1',
      assignmentTypeId: 'type-1',
      collaborationEnabled: false,
    });
    tx.assignment.update.mockResolvedValue({ id: 'a-1' });

    await updateAssignmentInClassDeployment({
      assignmentId: 'a-1',
      classId: 'class-1',
      data: {
        prompt: 'Updated.',
        collaborationEnabled: true,
        collaborationGroupMode: 'teacher',
        collaborationGroupSize: 3,
      },
    });

    expect(tx.assignment.update).toHaveBeenCalledWith({
      where: { id: 'a-1' },
      data: { prompt: 'Updated.' },
    });
  });

  test('preserves collaboration fields on an already collaborative assignment', async () => {
    tx.assignment.findFirst.mockResolvedValue({
      id: 'a-1',
      assignmentTypeId: 'type-1',
      collaborationEnabled: true,
    });
    tx.assignment.update.mockResolvedValue({ id: 'a-1' });

    await updateAssignmentInClassDeployment({
      assignmentId: 'a-1',
      classId: 'class-1',
      data: {
        prompt: 'Updated.',
        collaborationEnabled: true,
      },
    });

    expect(tx.assignment.update).toHaveBeenCalledWith({
      where: { id: 'a-1' },
      data: { prompt: 'Updated.', collaborationEnabled: true },
    });
  });
});

// Brian, 11/23: editing an assignment from My Assignments showed its classes
// locked. Teachers can now add and remove classes on an existing assignment.
describe('planAssignmentClassChange', () => {
  test('adds new classes and removes dropped ones', () => {
    expect(
      planAssignmentClassChange({
        currentClassIds: ['p3'],
        requestedClassIds: ['p3', 'p6', 'p6', ' '],
      })
    ).toEqual({ classIds: ['p3', 'p6'], added: ['p6'], removed: [] });
    expect(
      planAssignmentClassChange({
        currentClassIds: ['p3', 'p6'],
        requestedClassIds: ['p6'],
      })
    ).toEqual({ classIds: ['p6'], added: [], removed: ['p3'] });
  });
});

describe('changeAssignmentClasses', () => {
  beforeEach(() => {
    tx.assignment.findUnique.mockReset();
    tx.classAssignment.findMany.mockReset();
    tx.classAssignment.createMany.mockReset();
    tx.classAssignment.deleteMany.mockReset();
    tx.class.findMany.mockReset();
    tx.document.findFirst.mockReset();
  });

  const period3 = {
    id: 'ca-p3',
    classId: 'p3',
    class: { grade: '11', period: '3', title: 'Theology III' },
  };

  test('adds a class the teacher teaches with the edited dates', async () => {
    tx.assignment.findUnique.mockResolvedValue({ id: 'a-1', collaborationEnabled: false });
    tx.classAssignment.findMany.mockResolvedValue([period3]);
    tx.class.findMany.mockResolvedValue([{ id: 'p6' }]);
    const dueAt = new Date('2026-12-01T00:00:00Z');

    const plan = await changeAssignmentClasses({
      assignmentId: 'a-1',
      teacherMembershipId: 'teacher-1',
      requestedClassIds: ['p3', 'p6'],
      deployment: { postAt: null, dueAt },
    });

    expect(plan.added).toEqual(['p6']);
    expect(tx.class.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { in: ['p6'] },
          isArchived: false,
          teachers: { some: { id: 'teacher-1' } },
        }),
      })
    );
    expect(tx.classAssignment.createMany).toHaveBeenCalledWith({
      data: [{ assignmentId: 'a-1', classId: 'p6', postAt: null, dueAt }],
      skipDuplicates: true,
    });
    expect(tx.classAssignment.deleteMany).not.toHaveBeenCalled();
  });

  test('removes a class nobody has started', async () => {
    tx.assignment.findUnique.mockResolvedValue({ id: 'a-1', collaborationEnabled: false });
    tx.classAssignment.findMany.mockResolvedValue([
      period3,
      { id: 'ca-p6', classId: 'p6', class: { grade: '11', period: '6', title: 'Theology III' } },
    ]);
    tx.document.findFirst.mockResolvedValue(null);

    const plan = await changeAssignmentClasses({
      assignmentId: 'a-1',
      teacherMembershipId: 'teacher-1',
      requestedClassIds: ['p6'],
      deployment: {},
    });

    expect(plan.removed).toEqual(['p3']);
    expect(tx.classAssignment.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['ca-p3'] } },
    });
  });

  test('keeps a class whose students already started, and says why', async () => {
    tx.assignment.findUnique.mockResolvedValue({ id: 'a-1', collaborationEnabled: false });
    tx.classAssignment.findMany.mockResolvedValue([
      period3,
      { id: 'ca-p6', classId: 'p6', class: { grade: '11', period: '6', title: 'Theology III' } },
    ]);
    tx.document.findFirst.mockResolvedValue({ id: 'doc-1' });

    const error = await changeAssignmentClasses({
      assignmentId: 'a-1',
      teacherMembershipId: 'teacher-1',
      requestedClassIds: ['p6'],
      deployment: {},
    }).catch((e) => e);

    expect(error).toBeInstanceOf(AssignmentClassChangeError);
    expect(error.message).toMatch(/already started/);
    expect(tx.classAssignment.deleteMany).not.toHaveBeenCalled();
  });

  test('refuses an empty class list and a class the teacher does not teach', async () => {
    tx.assignment.findUnique.mockResolvedValue({ id: 'a-1', collaborationEnabled: false });
    tx.classAssignment.findMany.mockResolvedValue([period3]);
    const empty = await changeAssignmentClasses({
      assignmentId: 'a-1',
      teacherMembershipId: 'teacher-1',
      requestedClassIds: [],
      deployment: {},
    }).catch((e) => e);
    expect(empty.status).toBe(400);

    tx.class.findMany.mockResolvedValue([]);
    const foreign = await changeAssignmentClasses({
      assignmentId: 'a-1',
      teacherMembershipId: 'teacher-1',
      requestedClassIds: ['p3', 'someone-elses-class'],
      deployment: {},
    }).catch((e) => e);
    expect(foreign.status).toBe(404);
    expect(tx.classAssignment.createMany).not.toHaveBeenCalled();
  });

  test('a group project keeps its classes', async () => {
    tx.assignment.findUnique.mockResolvedValue({ id: 'a-1', collaborationEnabled: true });
    tx.classAssignment.findMany.mockResolvedValue([period3]);
    const error = await changeAssignmentClasses({
      assignmentId: 'a-1',
      teacherMembershipId: 'teacher-1',
      requestedClassIds: ['p3', 'p6'],
      deployment: {},
    }).catch((e) => e);
    expect(error).toBeInstanceOf(AssignmentClassChangeError);
    expect(tx.classAssignment.createMany).not.toHaveBeenCalled();
  });
});
