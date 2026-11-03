import { describe, expect, mock, test, beforeEach } from 'bun:test';

const tx = {
  assignment: {
    create: mock(),
    findFirst: mock(),
    update: mock(),
  },
  classAssignment: { createMany: mock() },
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

mock.module('~/domain/rubrics/rubric-release.server', () => ({
  shouldUseInternalRubricRelease: mock().mockResolvedValue(false),
  findReleasedRubricRevisionId: mock(),
}));

const { createAssignmentDeployedToClasses, updateAssignmentInClassDeployment } =
  await import('./assignment-deployment.server');

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
