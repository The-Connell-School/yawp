import { beforeEach, expect, mock, test } from 'bun:test';
import type { Flow } from './flow.server';

let enabled = true;
let activeMemberships = 0;
let row: { browserHash: string; expiresAt: Date; data: Flow['data'] };
const classInfo = {
  id: 'second',
  name: 'Science',
  teacher: 'Teacher',
  organization: 'School',
};
const create = mock(async () => ({}));
const findUnique = mock(async () => row);
const count = mock(async () => activeMemberships);
const tx = {
  $queryRaw: mock(async () => []),
  signonFlow: { findUnique, update: mock(async () => ({})) },
};
mock.module('~/utils/db.server', () => ({
  prisma: {
    user: {
      findUniqueOrThrow: async () => ({
        email: 'student@example.test',
        username: null,
        memberships: [],
      }),
    },
    orgMembership: { count },
    signonFlow: {
      create,
      deleteMany: async () => ({}),
      update: async () => ({}),
    },
    $transaction: async (operation: (client: typeof tx) => Promise<unknown>) =>
      operation(tx),
  },
}));
mock.module('~/domain/feature-flags/feature-flags.server', () => ({
  isFeatureFlagEnabled: async () => enabled,
}));
const confirmation = mock(async (_tx: unknown, flow: Flow) => ({
  state: flow.data.state,
}));
mock.module('./class-confirmation.server', () => ({
  classConfirmationState: confirmation,
}));
const { flowCookie, digest } = await import('./flow.server');
const { signedInTeacherPromptEntry } = await import('./teacher-prompts.server');

beforeEach(() => {
  enabled = true;
  activeMemberships = 0;
  create.mockClear();
  count.mockClear();
  findUnique.mockClear();
  confirmation.mockClear();
  row = {
    browserHash: digest('browser'),
    expiresAt: new Date(Date.now() + 60000),
    data: {
      teacherPromptEntry: true,
      userId: 'student',
      destination: '/app',
      state: {
        screen: 'class-found',
        variant: 'multiple',
        flowToken: 'token',
        classes: [{ ...classInfo, id: 'first' }, classInfo],
      },
    },
  };
});

async function load(
  screen: 'inactive' | 'class-code' = 'inactive',
  browser = 'browser'
) {
  const cookie = await flowCookie.serialize({ token: 'token', browser });
  return signedInTeacherPromptEntry(
    new Request(`http://localhost/${screen}`, {
      headers: { cookie },
    }),
    'student',
    screen
  );
}

test('revalidation and reload resume the browser-bound ambiguous selection without creating flows', async () => {
  for (let i = 0; i < 3; i++) {
    const result = await load();
    expect(result?.data.teacherPromptEntry.initialState).toEqual(
      row.data.state
    );
  }
  expect(create).not.toHaveBeenCalled();
});

test('joined continuation resumes before the inactive membership guard and revalidates its receipt', async () => {
  activeMemberships = 1;
  row.data.state = {
    screen: 'joined',
    flowToken: 'token',
    classInfo,
  };
  row.data.classConfirmation = {
    classId: 'second',
    classCode: 'shared',
    membershipId: 'member',
    already: false,
  };
  for (const screen of ['inactive', 'class-code'] as const) {
    expect(
      (await load(screen))?.data.teacherPromptEntry.initialState.screen
    ).toBe('joined');
  }
  expect(confirmation).toHaveBeenCalledTimes(2);
  expect(count).not.toHaveBeenCalled();
  expect(create).not.toHaveBeenCalled();
});

for (const invalid of [
  'owner',
  'browser',
  'expired',
  'completed',
  'unrelated',
]) {
  test(`does not resume an ${invalid} flow`, async () => {
    if (invalid === 'owner') row.data.userId = 'someone-else';
    if (invalid === 'expired') row.expiresAt = new Date(0);
    if (invalid === 'completed') row.data.completed = true;
    if (invalid === 'unrelated') delete row.data.teacherPromptEntry;
    const result = await load(
      'class-code',
      invalid === 'browser' ? 'other-browser' : 'browser'
    );
    expect(result?.data.teacherPromptEntry.initialState.screen).toBe(
      'class-code'
    );
    expect(result?.data.teacherPromptEntry.initialState.flowToken).not.toBe(
      'token'
    );
    expect(create).toHaveBeenCalledTimes(1);
  });
}

test('flag off does not read or create a flow', async () => {
  enabled = false;
  expect(await load()).toBeNull();
  expect(findUnique).not.toHaveBeenCalled();
  expect(create).not.toHaveBeenCalled();
});

test('storage errors propagate instead of silently replacing a flow', async () => {
  findUnique.mockImplementationOnce(async () => {
    throw new Error('storage unavailable');
  });
  await expect(load()).rejects.toThrow('storage unavailable');
  expect(create).not.toHaveBeenCalled();
});
