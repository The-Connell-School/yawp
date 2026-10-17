import { beforeEach, expect, mock, test } from 'bun:test';
let enabled = true;
mock.module('~/domain/free-tier/monthly-policy.server', () => ({
  monthlyFreeTierPolicy: async () => ({ enabled }),
}));
const {
  assertCanCreateAssignmentOfKindInTransaction,
  assertCanRetypeAssignmentOfKindInTransaction,
  loadAssignmentCreationQuotasForTypes,
} = await import('./assignment-quota.server');
const organization = { id: 'free-org', plan: 'FREE_CLASSROOM' as const };
const increment = mock(async () => ({}));
const tx = {
  $executeRawUnsafe: async () => {},
  freeClassroomAssignmentKindUsage: {
    findUnique: async () => ({ lifetimeCreatedCount: 999 }),
    upsert: increment,
  },
} as any;
beforeEach(() => {
  enabled = true;
  increment.mockClear();
});
for (const kind of ['class_starter', 'prewriting', 'thesis_statement'])
  test(`${kind} remains creatable above old cap, with lifetime compatibility writes`, async () => {
    await assertCanCreateAssignmentOfKindInTransaction(tx, organization, kind);
    expect(increment).toHaveBeenCalledTimes(1);
    await assertCanRetypeAssignmentOfKindInTransaction(
      tx,
      organization,
      'old',
      kind
    );
    expect(increment).toHaveBeenCalledTimes(2);
  });
test('unlimited cohort still rejects unsupported content', async () => {
  await expect(
    assertCanCreateAssignmentOfKindInTransaction(tx, organization, 'essay')
  ).rejects.toMatchObject({ code: 'kind_not_allowed' });
  expect(increment).not.toHaveBeenCalled();
});
test('untargeted/flag off/pending policy retains old caps', async () => {
  enabled = false;
  await expect(
    assertCanCreateAssignmentOfKindInTransaction(tx, organization, 'prewriting')
  ).rejects.toMatchObject({ code: 'quota_exhausted' });
});
test('paid plans short-circuit without new policy work', async () => {
  await assertCanCreateAssignmentOfKindInTransaction(
    {} as any,
    { id: 'paid', plan: 'SCHOOL' },
    'essay'
  );
  expect(increment).not.toHaveBeenCalled();
});
test('unlimited creation loaders remove quota exhausted fields', async () => {
  const quotas = await loadAssignmentCreationQuotasForTypes(organization, [
    { id: 'starter', kind: 'class_starter' },
    { id: 'essay', kind: 'essay' },
  ]);
  expect(quotas.get('starter')).toEqual({});
  expect(quotas.get('essay')).toEqual({
    unavailableReason: 'Available with a paid plan.',
  });
});
