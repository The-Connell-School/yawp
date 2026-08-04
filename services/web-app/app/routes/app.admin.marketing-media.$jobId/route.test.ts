import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { RENDER_LOCK_TIMEOUT_MS } from '../../../../../packages/marketing-media';

const requireAdmin = mock();
const requireMutableRequest = mock();
const requireMarketingStudioEnabled = mock();
const getSignedGetUrl = mock();

const prisma = {
  marketingMediaJob: {
    findUnique: mock(),
    findFirst: mock(),
    count: mock(),
    update: mock(),
    create: mock(),
  },
};
const reviseStoryboard = mock();

mock.module('~/utils/auth.server', () => ({
  requireAdmin,
  requireMutableRequest,
}));
mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/services/s3.server', () => ({ getSignedGetUrl }));
// Exports the union of what any route imports from this module — module
// mocks are process-global in bun and an incomplete one poisons other suites.
mock.module('~/services/marketing-storyboard.server', () => ({
  reviseStoryboard,
  generateStoryboard: mock(),
  StoryboardGenerationError: class StoryboardGenerationError extends Error {},
}));
const getMarketingMediaDir = mock();

mock.module('~/utils/marketing-studio.server', () => ({
  requireMarketingStudioEnabled,
  getMarketingMediaDir,
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
    updatedAt: new Date(),
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
    parentJobId: null,
    revisions: [],
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
    prisma.marketingMediaJob.findFirst.mockReset();
    prisma.marketingMediaJob.count.mockReset();
    prisma.marketingMediaJob.update.mockReset();
    prisma.marketingMediaJob.create.mockReset();
    reviseStoryboard.mockReset();
    // Default: nothing else is filming and nothing is ahead in the queue.
    prisma.marketingMediaJob.findFirst.mockResolvedValue(null);
    prisma.marketingMediaJob.count.mockResolvedValue(0);

    requireAdmin.mockResolvedValue({ id: 'admin-1' });
    requireMutableRequest.mockResolvedValue(undefined);
    requireMarketingStudioEnabled.mockReturnValue(undefined);
    getMarketingMediaDir.mockReset();
    getMarketingMediaDir.mockReturnValue(null);
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

  test('serves disk-stored outputs through the admin file route instead of S3', async () => {
    getMarketingMediaDir.mockReturnValue('/media');
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
      '/app/admin/marketing-media/job-1/file/01-dashboard.png'
    );
    expect(getSignedGetUrl).not.toHaveBeenCalled();
  });

  test('reports the render estimate from the stored storyboard', async () => {
    prisma.marketingMediaJob.findUnique.mockResolvedValue(job());

    const result = await loader(args(new Request('http://localhost/x')));

    expect(result.data.storyboard?.slug).toBe('teacher-loop');
    expect(result.data.estimatedSeconds).toBeGreaterThan(0);
  });

  test('flags a queued job nobody is rendering, with how long it has waited', async () => {
    prisma.marketingMediaJob.findUnique.mockResolvedValue(
      job({ status: 'QUEUED', updatedAt: new Date(Date.now() - 10 * 60_000) })
    );

    const result = await loader(args(new Request('http://localhost/x')));

    expect(result.data.queueStalled).toBe(true);
    expect(result.data.queuedMinutes).toBe(10);
  });

  // The worker is single-threaded and takes jobs oldest-first, so a job can
  // sit QUEUED for many minutes purely because a renderer is busy with an
  // earlier one — especially a failing job burning its retry budget. Telling
  // an admin "no renderer is attached" then is simply false, and sends them
  // off to start a second renderer that is not the problem.
  test('blames the queue, not a missing renderer, while one is filming', async () => {
    prisma.marketingMediaJob.findUnique.mockResolvedValue(
      job({ status: 'QUEUED', updatedAt: new Date(Date.now() - 10 * 60_000) })
    );
    prisma.marketingMediaJob.findFirst.mockResolvedValue({ id: 'job-ahead' });
    prisma.marketingMediaJob.count.mockResolvedValue(2);

    const result = await loader(args(new Request('http://localhost/x')));

    expect(result.data.queueStalled).toBe(false);
    expect(result.data.waitingForTurn).toBe(true);
    expect(result.data.queueAhead).toBe(2);
  });

  // A worker that died mid-render leaves its lock behind. That lock must not
  // read as a live renderer, or a genuinely unattended queue looks busy
  // forever.
  test('ignores a dead worker stale lock when looking for a live renderer', async () => {
    prisma.marketingMediaJob.findUnique.mockResolvedValue(
      job({ status: 'QUEUED', updatedAt: new Date(Date.now() - 10 * 60_000) })
    );

    await loader(args(new Request('http://localhost/x')));

    const where = prisma.marketingMediaJob.findFirst.mock.calls[0][0].where;
    expect(where.status).toBe('RENDERING');
    expect(where.lockedAt.gte).toBeInstanceOf(Date);
    expect(Date.now() - where.lockedAt.gte.getTime()).toBe(
      RENDER_LOCK_TIMEOUT_MS
    );
  });

  test('does not cry stalled while a renderer could still claim the job', async () => {
    prisma.marketingMediaJob.findUnique.mockResolvedValue(
      job({ status: 'QUEUED', updatedAt: new Date(Date.now() - 30_000) })
    );

    const result = await loader(args(new Request('http://localhost/x')));

    expect(result.data.queueStalled).toBe(false);
  });

  test('never flags a job that is actually rendering or done', async () => {
    for (const status of ['RENDERING', 'SUCCEEDED', 'FAILED']) {
      prisma.marketingMediaJob.findUnique.mockResolvedValue(
        job({ status, updatedAt: new Date(Date.now() - 60 * 60_000) })
      );

      const result = await loader(args(new Request('http://localhost/x')));

      expect(result.data.queueStalled).toBe(false);
    }
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

  // Reproduces the real failure: the renderer had already claimed this job
  // in the database and was mid-flight filming it in a real browser when
  // Re-render was clicked. The click doesn't touch that browser process — it
  // only resets the DB row — so an unguarded retry makes a job that is
  // actively being filmed look QUEUED again with attempts wiped to 0. When
  // the renderer eventually finishes, its own markSucceeded/markFailed call
  // fights the reset row. The fix is refusing the click in the first place.
  test('refuses to re-render a job that is still active', async () => {
    for (const status of ['GENERATING', 'QUEUED', 'RENDERING']) {
      prisma.marketingMediaJob.update.mockClear();
      prisma.marketingMediaJob.findUnique.mockResolvedValue(job({ status }));

      const response = await action(args(request({ intent: 'retry' })));

      expect(responseStatus(response)).toBe(400);
      expect(prisma.marketingMediaJob.update).not.toHaveBeenCalled();
    }
  });

  test('rejects an unknown intent', async () => {
    prisma.marketingMediaJob.findUnique.mockResolvedValue(job());

    const response = await action(
      args(request({ intent: 'delete-everything' }))
    );

    expect(responseStatus(response)).toBe(400);
    expect(prisma.marketingMediaJob.update).not.toHaveBeenCalled();
  });

  // Watching a take and saying what to change is the whole workflow: the first
  // render is a draft, the feedback box is the editor's chair.
  test('revises a finished render from feedback into a new linked job', async () => {
    prisma.marketingMediaJob.findUnique.mockResolvedValue(
      job({ status: 'SUCCEEDED' })
    );
    prisma.marketingMediaJob.create.mockResolvedValue({ id: 'job-2' });
    reviseStoryboard.mockResolvedValue({
      storyboard: STORYBOARD,
      model: 'claude-sonnet-4-6',
      raw: '{}',
    });

    const response = await action(
      args(
        request({
          intent: 'refine',
          feedback: 'Scroll to the prompt library and hold on it.',
        })
      )
    );

    const created = prisma.marketingMediaJob.create.mock.calls[0][0].data;
    expect(created).toMatchObject({
      parentJobId: 'job-1',
      status: 'GENERATING',
      kind: 'STILLS',
    });
    expect(reviseStoryboard.mock.calls[0][0]).toMatchObject({
      feedback: 'Scroll to the prompt library and hold on it.',
      previousStoryboard: STORYBOARD,
    });
    const queued = prisma.marketingMediaJob.update.mock.calls[0][0];
    expect(queued.where).toEqual({ id: 'job-2' });
    expect(queued.data.status).toBe('QUEUED');
    expect(response instanceof Response && response.status).toBe(302);
    expect(
      response instanceof Response && response.headers.get('location')
    ).toBe('/app/admin/marketing-media/job-2');
  });

  test('refuses to refine without feedback or without a storyboard', async () => {
    prisma.marketingMediaJob.findUnique.mockResolvedValue(
      job({ status: 'SUCCEEDED' })
    );
    const noFeedback = await action(args(request({ intent: 'refine' })));
    expect(responseStatus(noFeedback)).toBe(400);

    prisma.marketingMediaJob.findUnique.mockResolvedValue(
      job({ status: 'FAILED', storyboard: null })
    );
    const noStoryboard = await action(
      args(request({ intent: 'refine', feedback: 'longer hold' }))
    );
    expect(responseStatus(noStoryboard)).toBe(400);
    expect(prisma.marketingMediaJob.create).not.toHaveBeenCalled();
  });

  test('keeps the revision job with the reason when revision generation fails', async () => {
    prisma.marketingMediaJob.findUnique.mockResolvedValue(
      job({ status: 'SUCCEEDED' })
    );
    prisma.marketingMediaJob.create.mockResolvedValue({ id: 'job-2' });
    reviseStoryboard.mockRejectedValue(new Error('model unavailable'));

    const response = await action(
      args(request({ intent: 'refine', feedback: 'longer hold' }))
    );

    const failed = prisma.marketingMediaJob.update.mock.calls[0][0];
    expect(failed.where).toEqual({ id: 'job-2' });
    expect(failed.data.status).toBe('FAILED');
    expect(failed.data.error).toContain('model unavailable');
    expect(response instanceof Response && response.status).toBe(302);
  });
});
