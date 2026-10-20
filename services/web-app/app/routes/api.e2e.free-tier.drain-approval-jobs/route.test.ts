import { afterEach, describe, expect, mock, test } from 'bun:test';

const runApprovalJobs = mock(async () => {});
mock.module('~/domain/free-tier/approval-v2.server', () => ({
  runApprovalJobs,
}));

const { action, loader } = await import('./route');

describe('api.e2e.free-tier.drain-approval-jobs', () => {
  const envKeys = ['E2E', 'YAWP_ENVIRONMENT', 'NODE_ENV'] as const;
  const prev: Record<string, string | undefined> = {};

  afterEach(() => {
    for (const key of envKeys) {
      if (prev[key] === undefined) delete process.env[key];
      else process.env[key] = prev[key];
    }
    runApprovalJobs.mockClear();
  });

  function saveEnv() {
    for (const key of envKeys) {
      prev[key] = process.env[key];
    }
  }

  async function postDrain() {
    return action({
      request: new Request(
        'http://127.0.0.1/api/e2e/free-tier/drain-approval-jobs',
        { method: 'POST' }
      ),
    } as Parameters<typeof action>[0]);
  }

  test('returns 404 outside E2E', async () => {
    saveEnv();
    delete process.env.E2E;
    await expect(postDrain()).rejects.toMatchObject({ status: 404 });
    expect(runApprovalJobs).not.toHaveBeenCalled();
  });

  test('returns 404 on demo even when E2E is set', async () => {
    saveEnv();
    process.env.E2E = 'true';
    process.env.YAWP_ENVIRONMENT = 'demo';
    await expect(postDrain()).rejects.toMatchObject({ status: 404 });
    expect(runApprovalJobs).not.toHaveBeenCalled();
  });

  test('returns 404 on preview deploy even when E2E is set', async () => {
    saveEnv();
    process.env.E2E = 'true';
    process.env.YAWP_ENVIRONMENT = 'preview';
    await expect(postDrain()).rejects.toMatchObject({ status: 404 });
    expect(runApprovalJobs).not.toHaveBeenCalled();
  });

  test('returns 404 on production deploy even when E2E is set', async () => {
    saveEnv();
    process.env.E2E = 'true';
    process.env.YAWP_ENVIRONMENT = 'production';
    await expect(postDrain()).rejects.toMatchObject({ status: 404 });
    expect(runApprovalJobs).not.toHaveBeenCalled();
  });

  test('returns 404 when NODE_ENV is production even with E2E set', async () => {
    saveEnv();
    process.env.E2E = 'true';
    process.env.NODE_ENV = 'production';
    delete process.env.YAWP_ENVIRONMENT;
    await expect(postDrain()).rejects.toMatchObject({ status: 404 });
    expect(runApprovalJobs).not.toHaveBeenCalled();
  });

  test('drains queued jobs during local E2E', async () => {
    saveEnv();
    process.env.E2E = 'true';
    delete process.env.YAWP_ENVIRONMENT;
    delete process.env.NODE_ENV;
    const response = await postDrain();
    expect(response.status).toBe(204);
    expect(runApprovalJobs).toHaveBeenCalledTimes(1);
  });

  test('loader is not exposed', async () => {
    await expect(loader()).rejects.toMatchObject({ status: 404 });
  });
});
