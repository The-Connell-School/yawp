import { expect, test } from 'bun:test';
import { createAttributedPrisma, runWithImpersonation } from './internal-impersonation-context.server';

const identity = {
  id: 'impersonation-session',
  actorId: 'operator-user',
  userId: 'target-user',
  organizationId: 'target-org',
  membershipId: 'target-membership',
  expiresAt: new Date(Date.now() + 60000).toISOString(),
};
const setting = {
  id: 'setting-id',
  name: 'visible',
  value: 'readable',
  valueType: 'string',
  description: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

function sqlText(value: unknown) {
  return Array.isArray(value) ? value.join(' ') : String(value);
}

function fakeDatabaseWithUncoveredAuditTable() {
  const calls: string[] = [];
  const tx = {
    $queryRaw: async (query: unknown) => {
      const sql = sqlText(query);
      calls.push(sql);
      if (sql.includes('FROM "InternalImpersonationSession"')) return [{ id: identity.id }];
      if (sql.includes('pg_class')) return [{ name: 'UncoveredAuditFixture' }];
      return [];
    },
    orgMembership: {
      findFirst: async () => ({ id: identity.membershipId }),
    },
    setting: {
      findMany: async () => [setting],
      create: async () => ({ ...setting, name: 'created', value: 'written' }),
    },
  };
  const db = {
    $transaction: async (work: (client: typeof tx) => Promise<unknown>) => work(tx),
    setting: {
      findMany: async () => [{ ...setting, name: 'outside', value: 'ordinary' }],
      create: async () => ({ ...setting, name: 'outside-create', value: 'ordinary' }),
    },
  };
  return { db, calls };
}

test('impersonated read queries do not require mutation-audit trigger coverage', async () => {
  const { db, calls } = fakeDatabaseWithUncoveredAuditTable();
  const prisma = createAttributedPrisma(db as never);

  const result = await runWithImpersonation(identity, { requestId: 'read-request', action: 'http.GET' }, async () => identity, () =>
    prisma.setting.findMany({ where: { name: 'visible' } })
  );

  expect(result).toEqual([setting]);
  expect(calls.some(call => call.includes('pg_class'))).toBe(false);
});

test('impersonated write queries still fail closed when mutation-audit coverage is incomplete', async () => {
  const { db, calls } = fakeDatabaseWithUncoveredAuditTable();
  const prisma = createAttributedPrisma(db as never);

  await expect(runWithImpersonation(identity, { requestId: 'write-request', action: 'http.POST' }, async () => identity, () =>
    prisma.setting.create({ data: { name: 'created', value: 'written' } })
  )).rejects.toThrow('Impersonation audit coverage is incomplete');

  expect(calls.some(call => call.includes('pg_class'))).toBe(true);
});
