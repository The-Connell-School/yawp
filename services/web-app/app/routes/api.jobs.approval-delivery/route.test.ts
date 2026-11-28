import { beforeEach, describe, expect, mock, test } from 'bun:test';

const drainApprovalDelivery = mock();
const approvalDeliveryEnabled = mock();

mock.module('~/domain/free-tier/approval-delivery-runtime.server', () => ({
  drainApprovalDelivery,
  approvalDeliveryEnabled,
}));

const { action, loader } = await import('./route');

const url = 'https://example.com/api/jobs/approval-delivery';

function call(init: RequestInit & { path?: string } = {}) {
  const { path, ...rest } = init;
  return action({
    request: new Request(path ?? url, { method: 'POST', ...rest }),
  } as any) as Promise<Response>;
}

describe('api.jobs.approval-delivery', () => {
  beforeEach(() => {
    process.env.INTERNAL_COMMAND_TOKEN = 'job-token';
    drainApprovalDelivery.mockReset();
    approvalDeliveryEnabled.mockReset();
    approvalDeliveryEnabled.mockReturnValue(true);
    drainApprovalDelivery.mockResolvedValue('ok');
  });

  test('refuses a missing, wrong, or query-string token without draining', async () => {
    expect((await call()).status).toBe(401);
    expect(
      (await call({ headers: { 'x-internal-token': 'nope' } })).status
    ).toBe(401);
    expect((await call({ path: `${url}?token=job-token` })).status).toBe(401);
    expect(drainApprovalDelivery).not.toHaveBeenCalled();
  });

  test('fails closed when the server has no token configured', async () => {
    process.env.INTERNAL_COMMAND_TOKEN = '';
    const response = await call({ headers: { 'x-internal-token': '' } });
    expect(response.status).toBe(401);
    expect(drainApprovalDelivery).not.toHaveBeenCalled();
  });

  test('only accepts POST', async () => {
    const response = (await action({
      request: new Request(url, {
        method: 'PUT',
        headers: { 'x-internal-token': 'job-token' },
      }),
    } as any)) as Response;
    expect(response.status).toBe(405);
    expect((loader() as Response).status).toBe(405);
    expect(drainApprovalDelivery).not.toHaveBeenCalled();
  });

  test('runs one drain and reports done', async () => {
    const response = await call({ headers: { 'x-internal-token': 'job-token' } });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'done' });
    expect(drainApprovalDelivery).toHaveBeenCalledTimes(1);
  });

  test('skips when the approval worker is off for this deployment', async () => {
    approvalDeliveryEnabled.mockReturnValue(false);
    const response = await call({ headers: { 'x-internal-token': 'job-token' } });
    expect(await response.json()).toEqual({ status: 'skipped' });
    expect(drainApprovalDelivery).not.toHaveBeenCalled();
  });

  test('returns 500 so the failure shows in EventBridge when the drain fails', async () => {
    drainApprovalDelivery.mockResolvedValue('failed');
    const response = await call({ headers: { 'x-internal-token': 'job-token' } });
    expect(response.status).toBe(500);
  });

  test('answers within the EventBridge limit when a drain is slow', async () => {
    drainApprovalDelivery.mockReturnValue(new Promise(() => {}));
    const startedAt = Date.now();
    const response = await call({ headers: { 'x-internal-token': 'job-token' } });
    expect(await response.json()).toEqual({ status: 'running' });
    expect(Date.now() - startedAt).toBeLessThan(4800);
  }, 6000);
});
