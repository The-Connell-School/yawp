import { beforeEach, describe, expect, mock, test } from 'bun:test';

const catalogList = mock(async () => ({ rubrics: [] as object[] }));
const rubricCreate = mock();
const rubricUpdate = mock();

mock.module('~/domain/rubrics/rubric-catalog.server', () => ({
  RubricCatalog: class {
    constructor(_db: unknown) {}
    list = catalogList;
  },
  perTypeKey: (id: string) => `assignment-type:${id}`,
  perTypeContent: () => ({}),
}));

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
    catalogList.mockReset();
    catalogList.mockResolvedValue({ rubrics: [] });
    rubricCreate.mockReset();
    rubricUpdate.mockReset();
  });

  test('does not write Rubric rows when loading the form', async () => {
    await loader({
      request: new Request('http://localhost/app/admin/assignment-types/new'),
      params: {},
      context: {},
    } as never);

    expect(catalogList).toHaveBeenCalled();
    expect(rubricCreate).not.toHaveBeenCalled();
    expect(rubricUpdate).not.toHaveBeenCalled();
  });
});
