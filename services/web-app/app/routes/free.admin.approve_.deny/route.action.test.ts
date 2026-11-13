import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import type { ActionFunctionArgs } from 'react-router';

const denySchoolAdminApproval = mock();
const reopenDeniedSchoolAdminApproval = mock();

mock.module('~/utils/free-tier/free-tier-feature-gate.server', () => ({
  requireFreeTierEnabled: async () => {},
}));

mock.module('~/domain/feature-flags/feature-flags.server', () => ({
  isFeatureFlagEnabled: async () => true,
}));

mock.module('~/domain/free-tier/approval-deny.server', () => ({
  denySchoolAdminApproval,
  reopenDeniedSchoolAdminApproval,
  resolveAdminDenyAnsweredGate: async () => null,
}));

const { action } = await import('./route');

afterAll(() => mock.restore());

beforeEach(() => {
  denySchoolAdminApproval.mockReset();
  reopenDeniedSchoolAdminApproval.mockReset();
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

  test('reopen redirects to the approval screen with the fresh link', async () => {
    reopenDeniedSchoolAdminApproval.mockResolvedValueOnce({
      ok: true,
      approveToken: 'fresh.tok.en',
    });
    const form = new FormData();
    form.set('token', 'tok');
    form.set('intent', 'reopen');
    const thrown = await action({
      request: new Request('https://yawp.test/free/admin/approve/deny?t=tok', {
        method: 'POST',
        body: form,
      }),
      params: {},
      context: {},
    } as ActionFunctionArgs).catch((error: unknown) => error);
    expect(reopenDeniedSchoolAdminApproval).toHaveBeenCalledWith({ token: 'tok' });
    expect(denySchoolAdminApproval).not.toHaveBeenCalled();
    expect(thrown).toBeInstanceOf(Response);
    expect((thrown as Response).headers.get('Location')).toBe(
      '/free/admin/approve?t=fresh.tok.en'
    );
  });

  test('a refused reopen reports why instead of denying again', async () => {
    reopenDeniedSchoolAdminApproval.mockResolvedValueOnce({
      ok: false,
      reason: 'superseded',
    });
    const form = new FormData();
    form.set('token', 'tok');
    form.set('intent', 'reopen');
    const result = await action({
      request: new Request('https://yawp.test/free/admin/approve/deny?t=tok', {
        method: 'POST',
        body: form,
      }),
      params: {},
      context: {},
    } as ActionFunctionArgs);
    expect(result).toEqual({ ok: false, reopenFailed: true, reason: 'superseded' });
    expect(denySchoolAdminApproval).not.toHaveBeenCalled();
  });
});
