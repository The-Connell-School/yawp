import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import { signInternalApiRequest } from './internal-platform-signing.server';

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
  acquisitionToken: { findUnique, create },
  internalPlatformApiAudit: { create: mock(async () => ({})) },
};

mock.module('~/utils/db.server', () => ({ prisma }));

mock.module('~/domain/feature-flags/feature-flags.server', () => ({
  isFreeTierEnabled: async () => true,
}));

const { tokensCreate } = await import('./internal-free-tier-http.server');
const { tokenCreateSchema } = await import('~/domain/free-tier/service.server');
const { resetInternalApiMemoryNonceStore } = await import('./internal-platform-auth.server');
const previousOrigin = process.env.PRIMARY_APP_URL;
const previousKeys = process.env.YAWP_INTERNAL_API_KEYS;
const previousNonceStore = process.env.INTERNAL_API_NONCE_STORE;
const actor = 'operator@yawp.local';
const signing = { keyId: 'internal-token-contract', secret: 'local-contract-secret-000000000000000000000' };

// Captured from Internal's createFreeTierPlatformClient + mapTokenCreateToWire:
// maxUses=0 and blank optional form fields are omitted, not sent as 0/null.
const ordinaryInput = {
  label: 'Ordinary event link',
  bypassWaitlist: false,
  createIdempotencyKey: 'create-link-defaults',
};

function request(input: Record<string, unknown>) {
  const url = 'https://demo.test/api/internal/v1/free-tier/tokens';
  const body = JSON.stringify(input);
  const signed = signInternalApiRequest({
    url, method: 'POST', body, actor, ...signing,
  });
  return new Request(url, {
    method: 'POST', headers: { 'content-type': 'application/json', ...signed.headers }, body,
  });
}

describe('Internal token-create wire contract through the real signed handler and service', () => {
  beforeEach(() => {
    rows.length = 0;
    create.mockClear();
    resetInternalApiMemoryNonceStore();
    process.env.PRIMARY_APP_URL = 'https://demo.test';
    process.env.INTERNAL_API_NONCE_STORE = 'memory';
    process.env.YAWP_INTERNAL_API_KEYS = JSON.stringify([
      { id: signing.keyId, secret: signing.secret, scopes: ['management:write'] },
    ]);
  });

  afterAll(() => {
    if (previousOrigin === undefined) delete process.env.PRIMARY_APP_URL;
    else process.env.PRIMARY_APP_URL = previousOrigin;
    if (previousKeys === undefined) delete process.env.YAWP_INTERNAL_API_KEYS;
    else process.env.YAWP_INTERNAL_API_KEYS = previousKeys;
    if (previousNonceStore === undefined) delete process.env.INTERNAL_API_NONCE_STORE;
    else process.env.INTERNAL_API_NONCE_STORE = previousNonceStore;
    resetInternalApiMemoryNonceStore();
    mock.restore();
  });

  test('accepts ordinary defaults and consumes the request key before strict service validation', async () => {
    // The old demo handler passed this envelope directly to the strict service
    // schema, which rejects the request-only createIdempotencyKey field.
    const legacyValidation = tokenCreateSchema.safeParse(ordinaryInput);
    expect(legacyValidation.success).toBe(false);
    if (!legacyValidation.success) {
      expect(legacyValidation.error.issues).toContainEqual(expect.objectContaining({
        code: 'unrecognized_keys', keys: ['createIdempotencyKey'],
      }));
    }
    const response = await tokensCreate(request(ordinaryInput));
    expect(response.status).toBe(200);
    expect((await response.json()).tokens).toHaveLength(1);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      label: ordinaryInput.label, bypassWaitlist: false, maxUses: null,
      expiresAt: null, sourceName: null, eventLocation: null, eventDate: null,
      notes: null, createdBy: actor, createIdempotencyKey: ordinaryInput.createIdempotencyKey,
    });
  });

  test('accepts populated optional fields as emitted by Internal', async () => {
    const input = {
      ...ordinaryInput, maxUses: 12, expiresAt: '2027-01-01T17:30:00.000Z',
      sourceName: 'Conference', eventLocation: 'Demo',
      eventDate: '2026-11-20T00:00:00.000Z', notes: 'Booth',
    };
    expect((await tokensCreate(request(input))).status).toBe(200);
    expect(rows[0]).toMatchObject({
      maxUses: 12, expiresAt: new Date(input.expiresAt), sourceName: 'Conference',
      eventLocation: 'Demo', eventDate: new Date(input.eventDate), notes: 'Booth',
    });
  });

  test('replays one operation and keeps a distinct operation separate', async () => {
    const first = await tokensCreate(request(ordinaryInput));
    const replay = await tokensCreate(request(ordinaryInput));
    expect(first.status).toBe(200);
    expect(replay.status).toBe(200);
    expect(await replay.json()).toEqual(await first.json());
    expect(rows).toHaveLength(1);
    const distinct = await tokensCreate(request({ ...ordinaryInput, createIdempotencyKey: 'create-link-next' }));
    expect(distinct.status).toBe(200);
    expect(rows).toHaveLength(2);
    expect(create).toHaveBeenCalledTimes(2);
    expect(rows[0]!.id).not.toBe(rows[1]!.id);
  });

  test.each([
    { label: '' }, { maxUses: 0 }, { expiresAt: null },
    { eventDate: null }, { createIdempotencyKey: 'invalid key!' },
  ])('rejects invalid wire values without a token write: %j', async patch => {
    const response = await tokensCreate(request({ ...ordinaryInput, ...patch }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Invalid input' });
    expect(rows).toHaveLength(0);
    expect(create).not.toHaveBeenCalled();
  });

  test('rejects a request without the required signature', async () => {
    const signed = request(ordinaryInput);
    const headers = new Headers(signed.headers);
    headers.delete('x-yawp-signature');
    const response = await tokensCreate(new Request(signed, { headers }));
    expect(response.status).toBe(401);
    expect(rows).toHaveLength(0);
  });
});
