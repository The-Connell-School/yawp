import { beforeEach, describe, expect, mock, test } from 'bun:test';

const rubricCreate = mock();
const rubricUpdate = mock();

mock.module('~/utils/auth.server', () => ({
  requireAdmin: mock(async () => {}),
}));

mock.module('~/utils/db.server', () => ({
  prisma: {
    rubricRelease: { findMany: mock(async () => []) },
    rubric: {
      findMany: mock(async () => []),
      findFirst: mock(async () => null),
      create: rubricCreate,
      update: rubricUpdate,
    },
    assignmentType: { findMany: mock(async () => []) },
  },
}));

const { loader } = await import('./route');

describe('app.admin.assignment-types.new loader', () => {
  beforeEach(() => {
    rubricCreate.mockReset();
    rubricUpdate.mockReset();
  });

  test('does not write Rubric rows when loading the form', async () => {
    await loader({
      request: new Request('http://localhost/app/admin/assignment-types/new'),
      params: {},
      context: {},
    } as never);

    expect(rubricCreate).not.toHaveBeenCalled();
    expect(rubricUpdate).not.toHaveBeenCalled();
  });
});
