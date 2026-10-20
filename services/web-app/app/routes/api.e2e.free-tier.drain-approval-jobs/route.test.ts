import { afterEach, describe, expect, mock, test } from 'bun:test';

const runApprovalJobs = mock(async () => {});
mock.module('~/domain/free-tier/approval-v2.server', () => ({
  runApprovalJobs,
}));

const { action, loader } = await import('./route');

describe('api.e2e.free-tier.drain-approval-jobs', () => {
  const prevE2e = process.env.E2E;
  const prevEnv = process.env.YAWP_ENVIRONMENT;

  afterEach(() => {
    if (prevE2e === undefined) delete process.env.E2E;
    else process.env.E2E = prevE2e;
    if (prevEnv === undefined) delete process.env.YAWP_ENVIRONMENT;
    else process.env.YAWP_ENVIRONMENT = prevEnv;
    runApprovalJobs.mockClear();
  });

  test('returns 404 outside E2E', async () => {
    delete process.env.E2E;
    await expect(
      action({
        request: new Request(
          'http://127.0.0.1/api/e2e/free-tier/drain-approval-jobs',
          { method: 'POST' }
        ),
      } as Parameters<typeof action>[0])
    ).rejects.toMatchObject({ status: 404 });
    expect(runApprovalJobs).not.toHaveBeenCalled();
  });

  test('returns 404 on demo even when E2E is set', async () => {
    process.env.E2E = 'true';
    process.env.YAWP_ENVIRONMENT = 'demo';
    await expect(
      action({
        request: new Request(
          'http://127.0.0.1/api/e2e/free-tier/drain-approval-jobs',
          { method: 'POST' }
        ),
      } as Parameters<typeof action>[0])
    ).rejects.toMatchObject({ status: 404 });
    expect(runApprovalJobs).not.toHaveBeenCalled();
  });

  test('drains queued jobs during local E2E', async () => {
    process.env.E2E = 'true';
    delete process.env.YAWP_ENVIRONMENT;
    const response = await action({
      request: new Request(
        'http://127.0.0.1/api/e2e/free-tier/drain-approval-jobs',
        { method: 'POST' }
      ),
    } as Parameters<typeof action>[0]);
    expect(response.status).toBe(204);
    expect(runApprovalJobs).toHaveBeenCalledTimes(1);
  });

  test('loader is not exposed', async () => {
    await expect(loader()).rejects.toMatchObject({ status: 404 });
  });
});
