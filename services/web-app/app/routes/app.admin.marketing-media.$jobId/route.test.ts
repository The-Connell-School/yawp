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
// Union again: the index route imports deleteSmallObject from this module.
mock.module('~/services/s3.server', () => ({
  getSignedGetUrl,
  deleteSmallObject: mock(),
}));
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
    revisionFeedback: null,
    parent: null,
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
    // The cutoff is one timeout back from when the loader ran, not from now:
    // asserting exact equality fails whenever a millisecond ticks in between.
    const age = Date.now() - where.lockedAt.gte.getTime();
    expect(age).toBeGreaterThanOrEqual(RENDER_LOCK_TIMEOUT_MS);
    expect(age).toBeLessThan(RENDER_LOCK_TIMEOUT_MS + 1000);
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

  // "It didn't incorporate my feedback" is unanswerable while the only
  // evidence is two storyboards nobody wants to read side by side. The page
  // has to say what the revision actually moved.
  test('reports what a revision changed against the take it came from', async () => {
    prisma.marketingMediaJob.findUnique.mockResolvedValue(
      job({
        status: 'SUCCEEDED',
        parentJobId: 'job-0',
        revisionFeedback: 'Hold on the dashboard longer.',
        parent: { id: 'job-0', storyboard: STORYBOARD },
        storyboard: {
          ...STORYBOARD,
          scenes: [{ ...STORYBOARD.scenes[0], hold: 4 }],
        },
      })
    );

    const result = await loader(args(new Request('http://localhost/x')));

    expect(result.data.job.revisionFeedback).toBe(
      'Hold on the dashboard longer.'
    );
    expect(result.data.changes).toContainEqual({
      scene: 'dashboard',
      field: 'hold',
      before: '1.5',
      after: '4',
    });
  });

  // The revision that prompted all this: a model handing back what it was
  // given. An empty change list is the page saying so out loud.
  test('reports no changes when a revision changed nothing', async () => {
    prisma.marketingMediaJob.findUnique.mockResolvedValue(
      job({
        status: 'SUCCEEDED',
        parentJobId: 'job-0',
        revisionFeedback: 'Hold longer.',
        parent: { id: 'job-0', storyboard: STORYBOARD },
      })
    );

    const result = await loader(args(new Request('http://localhost/x')));

    expect(result.data.changes).toEqual([]);
  });

  test('has no change list on a first take', async () => {
    prisma.marketingMediaJob.findUnique.mockResolvedValue(job());

    const result = await loader(args(new Request('http://localhost/x')));

    expect(result.data.changes).toBeNull();
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
    // A revision is the model reading words too, so it comes back as a plan
    // the operator approves — see "approving a plan" below.
    expect(queued.data.status).toBe('DRAFT');
    expect(response instanceof Response && response.status).toBe(302);
    expect(
      response instanceof Response && response.headers.get('location')
    ).toBe('/app/admin/marketing-media/job-2');
  });

  // Without the request stored beside the result there is no way to judge a
  // revision: the operator sees a new storyboard and has to remember what they
  // asked for. It is also what a revision of a revision needs to stay honest.
  test('stores what the operator asked for on the revision', async () => {
    prisma.marketingMediaJob.findUnique.mockResolvedValue(
      job({ status: 'SUCCEEDED' })
    );
    prisma.marketingMediaJob.create.mockResolvedValue({ id: 'job-2' });
    reviseStoryboard.mockResolvedValue({
      storyboard: STORYBOARD,
      model: 'claude-sonnet-4-6',
      raw: '{}',
    });

    await action(
      args(
        request({
          intent: 'refine',
          feedback: 'Scroll to the prompt library and hold on it.',
        })
      )
    );

    expect(prisma.marketingMediaJob.create.mock.calls[0][0].data).toMatchObject(
      { revisionFeedback: 'Scroll to the prompt library and hold on it.' }
    );
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

describe('approving a plan', () => {
  beforeEach(() => {
    requireAdmin.mockReset();
    requireAdmin.mockResolvedValue({ id: 'admin-1' });
    requireMutableRequest.mockReset();
    requireMarketingStudioEnabled.mockReset();
    prisma.marketingMediaJob.findUnique.mockReset();
    prisma.marketingMediaJob.update.mockReset();
  });

  function draft(overrides: Record<string, unknown> = {}) {
    prisma.marketingMediaJob.findUnique.mockResolvedValue({
      id: 'job-1',
      status: 'DRAFT',
      kind: 'CLIP',
      brief: 'Show the reporter',
      audience: null,
      subjectType: 'FEATURE',
      subjectId: null,
      subjectLabel: null,
      targetUrl: 'http://localhost:5176',
      storyboard: { slug: 'a', title: 'A plan', scenes: [] },
      ...overrides,
    });
  }

  test('films a draft the operator approved', async () => {
    draft();
    const response: any = await action(args(request({ intent: 'approve' })));

    const [[update]] = prisma.marketingMediaJob.update.mock.calls;
    expect(update.data.status).toBe('QUEUED');
    expect(responseStatus(response)).not.toBe(400);
  });

  // Approving anything else would re-queue a take that already ran, or jump a
  // job the model is still writing.
  test('refuses to approve a job that is not a draft', async () => {
    draft({ status: 'SUCCEEDED' });
    const response: any = await action(args(request({ intent: 'approve' })));

    expect(responseStatus(response)).toBe(400);
    expect(prisma.marketingMediaJob.update).not.toHaveBeenCalled();
  });

  test('a draft can be discarded without filming it', async () => {
    draft();
    const response: any = await action(args(request({ intent: 'cancel' })));

    const [[update]] = prisma.marketingMediaJob.update.mock.calls;
    expect(update.data.status).toBe('CANCELLED');
    expect(responseStatus(response)).not.toBe(400);
  });
});
