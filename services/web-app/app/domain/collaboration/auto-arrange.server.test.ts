import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = { classAssignment: { findMany: mock() } };
const arrangeGroups = mock();

mock.module('~/utils/db.server', () => ({ prisma }));
// Spread the pristine module: bun's mock.module is global to the test run, so
// replacing it wholesale would strip openGroups/findStudentGroupDocument for
// other files (see the comment in test-preload.ts).
const actualGroups = globalThis.__realModules[
  '~/domain/collaboration/groups.server'
];
mock.module('~/domain/collaboration/groups.server', () => ({
  ...actualGroups,
  arrangeGroups,
}));

const { autoArrangeNewAssignment } = await import('./auto-arrange.server');

afterAll(() => {
  mock.restore();
  mock.module('~/domain/collaboration/groups.server', () => actualGroups);
});

describe('autoArrangeNewAssignment', () => {
  beforeEach(() => {
    prisma.classAssignment.findMany
      .mockReset()
      .mockResolvedValue([{ id: 'ca-1' }, { id: 'ca-2' }]);
    arrangeGroups.mockReset().mockResolvedValue({ groupCount: 2 });
  });

  const run = (overrides = {}) =>
    autoArrangeNewAssignment({
      assignmentId: 'a-1',
      mode: 'random',
      groupSize: 3,
      ...overrides,
    });

  test('arranges every class the assignment was deployed to', async () => {
    // One assignment fans out to one ClassAssignment per class, and each has its
    // own roster, so each needs its own arrangement.
    const result = await run();

    expect(arrangeGroups).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ arranged: 2, failed: 0 });
  });

  test('shuffles, because an alphabetical "random" group is not one', async () => {
    await run();

    expect(arrangeGroups).toHaveBeenCalledWith(
      expect.objectContaining({ classAssignmentId: 'ca-1', shuffle: true })
    );
  });

  test('passes the chosen size through for a sized mode', async () => {
    await run({ groupSize: 4 });

    expect(arrangeGroups).toHaveBeenCalledWith(
      expect.objectContaining({ groupSize: 4 })
    );
  });

  test('whole class arranges one group holding everyone', async () => {
    // A null size is what planGroups reads as "the group is the roster".
    await run({ mode: 'whole-class', groupSize: 4 });

    expect(arrangeGroups).toHaveBeenCalledWith(
      expect.objectContaining({ groupSize: null })
    );
  });

  test('does nothing for teacher-built groups', async () => {
    // That mode's whole point is an empty chart the teacher fills in.
    const result = await run({ mode: 'teacher' });

    expect(arrangeGroups).not.toHaveBeenCalled();
    expect(result).toEqual({ arranged: 0, failed: 0 });
  });

  test('one class failing does not stop the others', async () => {
    // The assignment already exists by this point. Losing the arrangement for
    // one class costs a shuffle on the groups page; throwing would leave the
    // teacher with an assignment they were told failed to create.
    arrangeGroups
      .mockRejectedValueOnce(new Error('deadlock'))
      .mockResolvedValueOnce({ groupCount: 2 });

    const result = await run();

    expect(result).toEqual({ arranged: 1, failed: 1 });
  });

  test('reports nothing to do when the assignment reached no classes', async () => {
    prisma.classAssignment.findMany.mockResolvedValue([]);

    await expect(run()).resolves.toEqual({ arranged: 0, failed: 0 });
    expect(arrangeGroups).not.toHaveBeenCalled();
  });

  test('scopes the lookup to this assignment', async () => {
    await run();

    expect(prisma.classAssignment.findMany.mock.calls[0][0].where).toEqual({
      assignmentId: 'a-1',
    });
  });
});
