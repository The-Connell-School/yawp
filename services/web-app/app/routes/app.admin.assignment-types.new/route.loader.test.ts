import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';

const listReleasedRubricsForAdminPicker = mock(async () => []);
const rubricCreate = mock();
const rubricUpdate = mock();

mock.module('~/utils/auth.server', () => ({
  requireAdmin: mock(async () => {}),
}));

mock.module('~/domain/rubrics/admin-rubric-picker.server', () => ({
  listReleasedRubricsForAdminPicker,
  resolveAdminRubricPickerSelection: mock(),
}));

mock.module('~/utils/db.server', () => ({
  prisma: {
    rubric: { create: rubricCreate, update: rubricUpdate },
  },
}));

const { loader } = await import('./route');

describe('app.admin.assignment-types.new loader', () => {
  afterEach(() => {
    mock.restore();
  });

  beforeEach(() => {
    listReleasedRubricsForAdminPicker.mockReset();
    rubricCreate.mockReset();
    rubricUpdate.mockReset();
    listReleasedRubricsForAdminPicker.mockResolvedValue([]);
  });

  test('does not write Rubric rows when loading the form', async () => {
    await loader({
      request: new Request('http://localhost/app/admin/assignment-types/new'),
      params: {},
      context: {},
    } as never);

    expect(listReleasedRubricsForAdminPicker).toHaveBeenCalled();
    expect(rubricCreate).not.toHaveBeenCalled();
    expect(rubricUpdate).not.toHaveBeenCalled();
  });
});
