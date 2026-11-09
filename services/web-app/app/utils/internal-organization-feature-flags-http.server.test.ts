import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { featureFlagPrismaTables } from '~/domain/feature-flags/feature-flags.server.test-support';

const prisma = {
  ...featureFlagPrismaTables(),
  internalPlatformApiAudit: { create: mock(async () => ({})) },
};
mock.module('~/utils/db.server', () => ({ prisma }));

const { organizationFeatureFlagUpdate } = await import(
  './internal-organization-feature-flags-http.server'
);

const key = 'k'.repeat(43);
const BASE =
  'https://yawp.test/api/internal/v1/organizations/org-1/feature-flags';

function post(body: unknown, flag = 'lesson_planner') {
  return new Request(`${BASE}/${flag}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${key}`,
      'content-type': 'application/json',
      'x-yawp-operator-email': 'ops@yawp.school',
    },
    body: JSON.stringify(body),
  });
}

describe('organization feature-flag endpoint', () => {
  let old: string | undefined;
  beforeEach(() => {
    mock.module('~/utils/db.server', () => ({ prisma }));
    old = process.env.YAWP_MANAGEMENT_SERVICE_KEY;
    process.env.YAWP_MANAGEMENT_SERVICE_KEY = key;
    prisma.adminConfigAudit.create.mockReset().mockResolvedValue({ id: 'audit-1' });
    prisma.setting.findUnique.mockReset().mockResolvedValue(null);
    prisma.setting.upsert.mockReset().mockImplementation(
      async (args: { update: { value: string; description: string } }) => ({
        name: 'feature_flag.lesson_planner',
        value: args.update.value,
        description: args.update.description,
        updatedAt: new Date('2026-10-07T16:00:00Z'),
      })
    );
    prisma.organization.findMany.mockReset().mockResolvedValue([{ id: 'org-1' }]);
  });
  afterEach(() => {
    if (old === undefined) delete process.env.YAWP_MANAGEMENT_SERVICE_KEY;
    else process.env.YAWP_MANAGEMENT_SERVICE_KEY = old;
  });

  test('enable targets a school', async () => {
    const response = await organizationFeatureFlagUpdate(
      post({ action: 'enable' }),
      'org-1',
      'lesson_planner'
    );
    expect(response.status).toBe(200);
    expect(JSON.parse(prisma.setting.upsert.mock.calls[0]?.[0].update.value)).toEqual({
      mode: 'targeted',
      orgIds: ['org-1'],
    });
  });

  test('rejects removed flags', async () => {
    const response = await organizationFeatureFlagUpdate(
      post({ action: 'enable' }),
      'org-1',
      'guided-tours'
    );
    expect(response.status).toBe(404);
  });

  test('disable returns 409 when the flag is on for everyone', async () => {
    prisma.setting.findUnique.mockResolvedValue({
      value: '{"mode":"everyone","orgIds":[]}',
    });
    const response = await organizationFeatureFlagUpdate(
      post({ action: 'disable' }),
      'org-1',
      'lesson_planner'
    );
    expect(response.status).toBe(409);
    expect((await response.json()).error).toContain('everyone');
    expect(prisma.setting.upsert).not.toHaveBeenCalled();
  });
});
