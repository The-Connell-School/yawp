import { afterEach, describe, expect, mock, test } from 'bun:test';

const runApprovalJobs = mock(async () => {});
mock.module('~/domain/free-tier/approval-v2.server', () => ({
  runApprovalJobs,
}));

const { action, loader } = await import('./route');

describe('api.e2e.free-tier.drain-approval-jobs', () => {
  const savedE2e = process.env.E2E;
  const savedEnv = process.env.YAWP_ENVIRONMENT;
  const savedNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    if (savedE2e === undefined) delete process.env.E2E;
    else process.env.E2E = savedE2e;
    if (savedEnv === undefined) delete process.env.YAWP_ENVIRONMENT;
    else process.env.YAWP_ENVIRONMENT = savedEnv;
    if (savedNodeEnv === undefined) Reflect.deleteProperty(process.env, 'NODE_ENV');
    else process.env.NODE_ENV = savedNodeEnv;
    runApprovalJobs.mockClear();
  });

  async function postDrain() {
    return action({
      request: new Request(
        'http://127.0.0.1/api/e2e/free-tier/drain-approval-jobs',
        { method: 'POST' }
      ),
    } as Parameters<typeof action>[0]);
  }

  test('returns 404 outside E2E', async () => {
    delete process.env.E2E;
    await expect(postDrain()).rejects.toMatchObject({ status: 404 });
    expect(runApprovalJobs).not.toHaveBeenCalled();
  });

  test('returns 404 on demo even when E2E is set', async () => {
    process.env.E2E = 'true';
    process.env.YAWP_ENVIRONMENT = 'demo';
    await expect(postDrain()).rejects.toMatchObject({ status: 404 });
    expect(runApprovalJobs).not.toHaveBeenCalled();
  });

  test('returns 404 on preview deploy even when E2E is set', async () => {
    process.env.E2E = 'true';
    process.env.YAWP_ENVIRONMENT = 'preview';
    await expect(postDrain()).rejects.toMatchObject({ status: 404 });
    expect(runApprovalJobs).not.toHaveBeenCalled();
  });

  test('returns 404 on production deploy even when E2E is set', async () => {
    process.env.E2E = 'true';
    process.env.YAWP_ENVIRONMENT = 'production';
    await expect(postDrain()).rejects.toMatchObject({ status: 404 });
    expect(runApprovalJobs).not.toHaveBeenCalled();
  });

  test('returns 404 when NODE_ENV is production even with E2E set', async () => {
    process.env.E2E = 'true';
    process.env.NODE_ENV = 'production';
    delete process.env.YAWP_ENVIRONMENT;
    await expect(postDrain()).rejects.toMatchObject({ status: 404 });
    expect(runApprovalJobs).not.toHaveBeenCalled();
  });

  test('drains queued jobs during local E2E', async () => {
    process.env.E2E = 'true';
    delete process.env.YAWP_ENVIRONMENT;
    process.env.NODE_ENV = 'test';
    const response = await postDrain();
    expect(response.status).toBe(204);
    expect(runApprovalJobs).toHaveBeenCalledTimes(1);
  });

  test('loader is not exposed', async () => {
    await expect(loader()).rejects.toMatchObject({ status: 404 });
  });
});
