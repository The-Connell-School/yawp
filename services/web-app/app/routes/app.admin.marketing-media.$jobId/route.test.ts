import { beforeEach, describe, expect, mock, test } from 'bun:test';

const requireAdmin = mock();
const requireMutableRequest = mock();
const requireMarketingStudioEnabled = mock();
const getSignedGetUrl = mock();

const prisma = {
  marketingMediaJob: { findUnique: mock(), update: mock() },
};

mock.module('~/utils/auth.server', () => ({
  requireAdmin,
  requireMutableRequest,
}));
mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/services/s3.server', () => ({ getSignedGetUrl }));
mock.module('~/utils/marketing-studio.server', () => ({
  requireMarketingStudioEnabled,
  isMarketingStudioEnabled: () => true,
  getMarketingRenderTarget: () => 'https://demo.yawp.test',
}));

const { action, loader } = await import('./route');

/** Route handlers return either a Response or a data() payload; both carry a status. */
function responseStatus(response: any) {
  return response.status ?? response.init?.status;
}

function readData(response: any) {
  return response.data;
}

const STORYBOARD = {
  slug: 'teacher-loop',
  title: 'The teacher loop',
  persona: 'teacher',
  scenes: [{ id: 'dashboard', goto: '/app', waitFor: 'main' }],
};

function job(overrides: Record<string, unknown> = {}) {
  return {
    id: 'job-1',
    createdAt: new Date('2026-08-01T00:00:00Z'),
    kind: 'STILLS',
    status: 'QUEUED',
    brief: 'Show the teacher grading loop.',
    audience: null,
    subjectLabel: null,
    storyboard: STORYBOARD,
    model: 'claude-sonnet-4-6',
    targetUrl: 'https://demo.yawp.test',
    outputs: [],
    error: null,
    attempts: 0,
    startedAt: null,
    finishedAt: null,
    createdBy: { email: 'admin@yawp.test', name: 'Admin' },
    ...overrides,
  };
}

function request(fields: Record<string, string> = {}) {
  return new Request('http://localhost/app/admin/marketing-media/job-1', {
    method: 'POST',
    body: new URLSearchParams(fields),
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
  });
}

const args = (req: Request) =>
  ({ request: req, params: { jobId: 'job-1' }, context: {} as never }) as never;

describe('marketing media job page', () => {
  beforeEach(() => {
    requireAdmin.mockReset();
    requireMutableRequest.mockReset();
    requireMarketingStudioEnabled.mockReset();
    getSignedGetUrl.mockReset();
    prisma.marketingMediaJob.findUnique.mockReset();
    prisma.marketingMediaJob.update.mockReset();

    requireAdmin.mockResolvedValue({ id: 'admin-1' });
    requireMutableRequest.mockResolvedValue(undefined);
    requireMarketingStudioEnabled.mockReturnValue(undefined);
    prisma.marketingMediaJob.update.mockResolvedValue({ id: 'job-1' });
    getSignedGetUrl.mockImplementation(
      async (key: string) => `https://signed/${key}`
    );
  });

  test('signs every output url rather than exposing the bucket', async () => {
    prisma.marketingMediaJob.findUnique.mockResolvedValue(
      job({
        status: 'SUCCEEDED',
        outputs: [
          {
            kind: 'IMAGE',
            key: 'marketing-media/job-1/01-dashboard.png',
            contentType: 'image/png',
            bytes: 1234,
            label: 'dashboard',
          },
        ],
      })
    );

    const result = await loader(args(new Request('http://localhost/x')));

    expect(result.data.outputs[0].url).toBe(
      'https://signed/marketing-media/job-1/01-dashboard.png'
    );
    expect(getSignedGetUrl).toHaveBeenCalledTimes(1);
  });

  test('reports the render estimate from the stored storyboard', async () => {
    prisma.marketingMediaJob.findUnique.mockResolvedValue(job());

    const result = await loader(args(new Request('http://localhost/x')));

    expect(result.data.storyboard?.slug).toBe('teacher-loop');
    expect(result.data.estimatedSeconds).toBeGreaterThan(0);
  });

  test('404s for an unknown job', async () => {
    prisma.marketingMediaJob.findUnique.mockResolvedValue(null);

    expect(
      loader(args(new Request('http://localhost/x')))
    ).rejects.toBeInstanceOf(Response);
  });

  test('cancels an active job', async () => {
    prisma.marketingMediaJob.findUnique.mockResolvedValue(
      job({ status: 'QUEUED' })
    );

    await action(args(request({ intent: 'cancel' })));

    expect(prisma.marketingMediaJob.update.mock.calls[0][0].data.status).toBe(
      'CANCELLED'
    );
  });

  test('will not cancel a job that already finished', async () => {
    prisma.marketingMediaJob.findUnique.mockResolvedValue(
      job({ status: 'SUCCEEDED' })
    );

    const response = await action(args(request({ intent: 'cancel' })));

    expect(responseStatus(response)).toBe(400);
    expect(prisma.marketingMediaJob.update).not.toHaveBeenCalled();
  });

  test('re-queues a finished job and clears the previous failure', async () => {
    prisma.marketingMediaJob.findUnique.mockResolvedValue(
      job({ status: 'FAILED', error: 'timed out', attempts: 3 })
    );

    await action(args(request({ intent: 'retry' })));

    const update = prisma.marketingMediaJob.update.mock.calls[0][0].data;
    expect(update).toMatchObject({
      status: 'QUEUED',
      error: null,
      attempts: 0,
      lockedAt: null,
      finishedAt: null,
    });
  });

  test('refuses to re-render a job that never got a storyboard', async () => {
    prisma.marketingMediaJob.findUnique.mockResolvedValue(
      job({ status: 'FAILED', storyboard: null })
    );

    const response = await action(args(request({ intent: 'retry' })));

    expect(responseStatus(response)).toBe(400);
    expect(prisma.marketingMediaJob.update).not.toHaveBeenCalled();
  });

  test('rejects an unknown intent', async () => {
    prisma.marketingMediaJob.findUnique.mockResolvedValue(job());

    const response = await action(
      args(request({ intent: 'delete-everything' }))
    );

    expect(responseStatus(response)).toBe(400);
    expect(prisma.marketingMediaJob.update).not.toHaveBeenCalled();
  });
});
