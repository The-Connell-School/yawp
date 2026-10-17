import { beforeEach, describe, expect, mock, test } from 'bun:test';

type StoredToken = {
  id: string;
  code: string;
  label: string;
  bypassWaitlist: boolean;
  maxUses: number | null;
  expiresAt: Date | null;
  createdBy: string | null;
  sourceName: string | null;
  eventLocation: string | null;
  eventDate: Date | null;
  notes: string | null;
  createdAt: Date;
  createIdempotencyKey: string | null;
};

const rows: StoredToken[] = [];
const executeRaw = mock(async () => [{ locked: 1 }]);
const findUnique = mock(async ({ where }: { where: { code?: string; tokenHash?: string; createIdempotencyKey?: string } }) =>
  rows.find(
    (row) =>
      (where.code != null && row.code === where.code) ||
      (where.createIdempotencyKey != null && row.createIdempotencyKey === where.createIdempotencyKey)
  ) ?? null
);
const findFirst = mock(async ({ where }: { where: Record<string, any> }) =>
  rows.find((row) =>
    row.label === where.label &&
    row.bypassWaitlist === where.bypassWaitlist &&
    row.maxUses === where.maxUses &&
    row.expiresAt?.getTime() === where.expiresAt?.getTime() &&
    row.createdBy === where.createdBy &&
    row.sourceName === where.sourceName &&
    row.eventLocation === where.eventLocation &&
    row.eventDate?.getTime() === where.eventDate?.getTime() &&
    row.notes === where.notes &&
    row.createdAt >= where.createdAt.gte
  ) ?? null
);
const create = mock(async ({ data }: { data: Record<string, any> }) => {
  const row: StoredToken = {
    id: `tok-${rows.length + 1}`,
    code: data.code,
    label: data.label,
    bypassWaitlist: data.bypassWaitlist,
    maxUses: data.maxUses,
    expiresAt: data.expiresAt ?? null,
    createdBy: data.createdBy ?? null,
    sourceName: data.sourceName ?? null,
    eventLocation: data.eventLocation ?? null,
    eventDate: data.eventDate ?? null,
    notes: data.notes ?? null,
    createdAt: new Date(),
    createIdempotencyKey: data.createIdempotencyKey ?? null,
  };
  rows.push(row);
  return { id: row.id };
});

const prisma = {
  $transaction: async (fn: (tx: any) => Promise<unknown>) => fn(prisma),
  $executeRaw: executeRaw,
  acquisitionToken: { findUnique, findFirst, create },
};

mock.module('~/utils/db.server', () => ({ prisma }));

process.env.PRIMARY_APP_URL = 'https://demo.yawp.school';
const { createAcquisitionTokens } = await import('./service.server');

describe('createAcquisitionTokens idempotency', () => {
  beforeEach(() => {
    rows.length = 0;
    executeRaw.mockClear();
    findUnique.mockClear();
    findFirst.mockClear();
    create.mockClear();
  });

  test('replays a recent matching create instead of minting a duplicate token', async () => {
    const input = {
      label: 'NCTE booth',
      bypassWaitlist: false,
      maxUses: 25,
      count: 1,
      createdBy: 'operator@yawp.school',
      sourceName: 'NCTE',
      eventLocation: 'Boston',
      eventDate: '2026-11-20T00:00:00.000Z',
      notes: 'Table 14',
    };
    const first = await createAcquisitionTokens(input, { idempotencyKey: 'create-link-1' });
    const second = await createAcquisitionTokens(input, { idempotencyKey: 'create-link-1' });
    expect(second).toEqual(first);
    expect(create).toHaveBeenCalledTimes(1);
    expect(rows).toHaveLength(1);
  });

  test('mints separate tokens for matching creates without an idempotency key', async () => {
    const input = {
      label: 'NCTE booth',
      bypassWaitlist: false,
      maxUses: 25,
      count: 1,
      createdBy: 'operator@yawp.school',
      sourceName: 'NCTE',
      eventLocation: 'Boston',
      eventDate: '2026-11-20T00:00:00.000Z',
      notes: 'Table 14',
    };
    const first = await createAcquisitionTokens(input);
    const second = await createAcquisitionTokens(input);
    expect(second).not.toEqual(first);
    expect(create).toHaveBeenCalledTimes(2);
    expect(rows).toHaveLength(2);
  });

  test('mints separate tokens for matching creates with different idempotency keys', async () => {
    const input = {
      label: 'NCTE booth',
      bypassWaitlist: false,
      maxUses: 25,
      count: 1,
      createdBy: 'operator@yawp.school',
      sourceName: 'NCTE',
      eventLocation: 'Boston',
      eventDate: '2026-11-20T00:00:00.000Z',
      notes: 'Table 14',
    };
    const first = await createAcquisitionTokens(input, { idempotencyKey: 'create-link-1' });
    const second = await createAcquisitionTokens(input, { idempotencyKey: 'create-link-2' });
    expect(second).not.toEqual(first);
    expect(create).toHaveBeenCalledTimes(2);
    expect(rows).toHaveLength(2);
  });
});
