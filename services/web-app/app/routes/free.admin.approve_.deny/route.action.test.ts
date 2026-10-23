import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import type { ActionFunctionArgs } from 'react-router';

const denySchoolAdminApproval = mock();

mock.module('~/utils/free-tier/free-tier-feature-gate.server', () => ({
  requireFreeTierEnabled: async () => {},
}));

mock.module('~/domain/feature-flags/feature-flags.server', () => ({
  isFeatureFlagEnabled: async () => true,
}));

mock.module('~/domain/free-tier/approval-deny.server', () => ({
  denySchoolAdminApproval,
  resolveAdminDenyAnsweredGate: async () => null,
}));

const { action } = await import('./route');

afterAll(() => mock.restore());

beforeEach(() => {
  denySchoolAdminApproval.mockReset();
});

describe('free.admin.approve_.deny action', () => {
  test('delegates to denySchoolAdminApproval with token and reason', async () => {
    denySchoolAdminApproval.mockResolvedValueOnce({ ok: true });
    const form = new FormData();
    form.set('token', 'tok');
    form.set('reason', 'policy');
    const result = await action({
      request: new Request('https://yawp.test/free/admin/approve/deny', {
        method: 'POST',
        body: form,
      }),
      params: {},
      context: {},
    } as ActionFunctionArgs);
    expect(denySchoolAdminApproval).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ ok: true });
  });
});
