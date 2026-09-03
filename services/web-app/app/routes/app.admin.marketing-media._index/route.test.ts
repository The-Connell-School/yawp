import { beforeEach, describe, expect, mock, test } from 'bun:test';

const requireAdmin = mock();
const requireMutableRequest = mock();
const generateStoryboard = mock();
const requireMarketingStudioEnabled = mock();
const getMarketingRenderTarget = mock();

class StoryboardGenerationError extends Error {}

const deleteSmallObject = mock();

const prisma = {
  marketingMediaJob: {
    create: mock(),
    update: mock(),
    findMany: mock(),
    findUnique: mock(),
    delete: mock(),
  },
  assignmentType: { findMany: mock(), findUnique: mock() },
};

// Union again: the $jobId route imports getSignedGetUrl from this module, and
// a mock missing it makes that suite fail to import at all.
mock.module('~/services/s3.server', () => ({
  deleteSmallObject,
  getSignedGetUrl: mock(),
}));

mock.module('~/utils/auth.server', () => ({
  requireAdmin,
  requireMutableRequest,
}));
mock.module('~/utils/db.server', () => ({ prisma }));
// Module mocks are process-global in bun: every suite that mocks this module
// must export the union of names any route imports, or suites poison each
// other when they share a test process.
mock.module('~/utils/marketing-studio.server', () => ({
  requireMarketingStudioEnabled,
  getMarketingRenderTarget,
  getMarketingMediaDir: () => null,
  isMarketingStudioEnabled: () => true,
}));
// Exports the union of what any route imports from this module — module
// mocks are process-global in bun and an incomplete one poisons other suites
// sharing the test process (the $jobId route also mocks this module).
mock.module('~/services/marketing-storyboard.server', () => ({
  generateStoryboard,
  reviseStoryboard: mock(),
  StoryboardGenerationError,
}));

const { action } = await import('./route');

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

function postForm(fields: Record<string, string>) {
  const body = new URLSearchParams(fields);
  return new Request('http://localhost/app/admin/marketing-media', {
    method: 'POST',
    body,
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
  });
}

async function runAction(fields: Record<string, string>) {
  return action({
    request: postForm(fields),
    params: {},
    context: {} as never,
  } as never);
}

describe('marketing media job creation', () => {
  beforeEach(() => {
    requireAdmin.mockReset();
    requireMutableRequest.mockReset();
    generateStoryboard.mockReset();
    requireMarketingStudioEnabled.mockReset();
    getMarketingRenderTarget.mockReset();
    prisma.marketingMediaJob.create.mockReset();
    prisma.marketingMediaJob.update.mockReset();
    prisma.assignmentType.findUnique.mockReset();

    requireAdmin.mockResolvedValue({ id: 'admin-1' });
    requireMutableRequest.mockResolvedValue(undefined);
    requireMarketingStudioEnabled.mockReturnValue(undefined);
    getMarketingRenderTarget.mockReturnValue('https://demo.yawp.test');
    prisma.marketingMediaJob.create.mockResolvedValue({ id: 'job-1' });
    prisma.marketingMediaJob.update.mockResolvedValue({ id: 'job-1' });
  });

  test('refuses to run when the studio is disabled', async () => {
    requireMarketingStudioEnabled.mockImplementation(() => {
      throw new Response('Not Found', { status: 404 });
    });

    expect(
      runAction({ brief: 'a'.repeat(20), kind: 'STILLS' })
    ).rejects.toBeInstanceOf(Response);
    expect(prisma.marketingMediaJob.create).not.toHaveBeenCalled();
  });

  test('rejects a brief that says nothing', async () => {
    const response = await runAction({ brief: 'short', kind: 'STILLS' });

    expect(responseStatus(response)).toBe(400);
    expect(prisma.marketingMediaJob.create).not.toHaveBeenCalled();
  });

  // The library is the no-guessing path: hand-verified storyboards an admin
  // renders with one click, no model in the loop.
  test('queues a library entry directly with its curated storyboard', async () => {
    const { MARKETING_LIBRARY } = await import(
      '../../../../../packages/marketing-media'
    );
    const entry = MARKETING_LIBRARY[0];

    const response = await runAction({
      intent: 'render-library',
      librarySlug: entry.slug,
    });

    const created = prisma.marketingMediaJob.create.mock.calls[0][0].data;
    expect(created.status).toBe('QUEUED');
    expect(created.kind).toBe(entry.kind);
    expect(created.model).toBeNull();
    expect(created.storyboard).toMatchObject({ slug: entry.slug });
    expect(response instanceof Response && response.status).toBe(302);
  });

  test('rejects an unknown library slug', async () => {
    const response = await runAction({
      intent: 'render-library',
      librarySlug: 'not-a-real-entry',
    });

    expect(responseStatus(response)).toBe(400);
    expect(prisma.marketingMediaJob.create).not.toHaveBeenCalled();
  });

  test('queues a pasted storyboard without calling the model', async () => {
    const response = await runAction({
      brief: 'Show the teacher grading loop end to end.',
      kind: 'STILLS',
      storyboardJson: JSON.stringify(STORYBOARD),
    });

    expect(generateStoryboard).not.toHaveBeenCalled();
    expect(prisma.marketingMediaJob.create).toHaveBeenCalledTimes(1);

    const created = prisma.marketingMediaJob.create.mock.calls[0][0].data;
    expect(created.status).toBe('QUEUED');
    expect(created.targetUrl).toBe('https://demo.yawp.test');
    expect(created.storyboard.slug).toBe('teacher-loop');
    expect(responseStatus(response)).toBe(302);
    expect((response as Response).headers.get('location')).toBe(
      '/app/admin/marketing-media/job-1'
    );
  });

  test('rejects a pasted storyboard that leaves the allowed routes', async () => {
    const response = await runAction({
      brief: 'Show the teacher grading loop end to end.',
      kind: 'STILLS',
      storyboardJson: JSON.stringify({
        ...STORYBOARD,
        scenes: [{ id: 'external', goto: 'https://example.com' }],
      }),
    });

    expect(responseStatus(response)).toBe(400);
    expect(String(readData(response).error)).toContain('route must be one of');
    expect(prisma.marketingMediaJob.create).not.toHaveBeenCalled();
  });

  test('rejects pasted json that is not json', async () => {
    const response = await runAction({
      brief: 'Show the teacher grading loop end to end.',
      kind: 'STILLS',
      storyboardJson: 'not json',
    });

    expect(responseStatus(response)).toBe(400);
    expect(prisma.marketingMediaJob.create).not.toHaveBeenCalled();
  });

  test('generates a storyboard from a brief and queues the job', async () => {
    generateStoryboard.mockResolvedValue({
      storyboard: STORYBOARD,
      model: 'claude-sonnet-4-6',
      raw: '{}',
    });

    await runAction({
      brief: 'Show the teacher grading loop end to end.',
      audience: 'Department chairs',
      kind: 'CLIP',
    });

    expect(prisma.marketingMediaJob.create.mock.calls[0][0].data.status).toBe(
      'GENERATING'
    );
    expect(generateStoryboard.mock.calls[0][0]).toMatchObject({
      kind: 'CLIP',
      audience: 'Department chairs',
    });

    const update = prisma.marketingMediaJob.update.mock.calls[0][0];
    expect(update.where.id).toBe('job-1');
    expect(update.data.status).toBe('QUEUED');
    expect(update.data.model).toBe('claude-sonnet-4-6');
  });

  test('keeps the job and records why generation failed', async () => {
    generateStoryboard.mockRejectedValue(
      new StoryboardGenerationError(
        'The generated storyboard was not valid: persona'
      )
    );

    const response = await runAction({
      brief: 'Show the teacher grading loop end to end.',
      kind: 'STILLS',
    });

    const update = prisma.marketingMediaJob.update.mock.calls[0][0];
    expect(update.data.status).toBe('FAILED');
    expect(update.data.error).toContain('persona');
    expect(responseStatus(response)).toBe(302);
  });

  test('attaches the chosen course to the job', async () => {
    prisma.assignmentType.findUnique.mockResolvedValue({
      id: 'at-1',
      title: 'Argumentative Essay',
    });
    generateStoryboard.mockResolvedValue({
      storyboard: STORYBOARD,
      model: 'claude-sonnet-4-6',
      raw: '{}',
    });

    await runAction({
      brief: 'Show how this course runs for a class.',
      kind: 'STILLS',
      assignmentTypeId: 'at-1',
    });

    const created = prisma.marketingMediaJob.create.mock.calls[0][0].data;
    expect(created.subjectType).toBe('ASSIGNMENT_TYPE');
    expect(created.subjectLabel).toBe('Argumentative Essay');
    expect(generateStoryboard.mock.calls[0][0].subject).toMatchObject({
      label: 'Argumentative Essay',
    });
  });
});

describe('deleting a render', () => {
  beforeEach(() => {
    requireAdmin.mockReset();
    requireMutableRequest.mockReset();
    requireMarketingStudioEnabled.mockReset();
    deleteSmallObject.mockReset();
    prisma.marketingMediaJob.findUnique.mockReset();
    prisma.marketingMediaJob.delete.mockReset();

    requireAdmin.mockResolvedValue({ id: 'admin-1' });
    requireMutableRequest.mockResolvedValue(undefined);
    deleteSmallObject.mockResolvedValue(undefined);
    prisma.marketingMediaJob.delete.mockResolvedValue({ id: 'job-1' });
  });

  test('removes the job and the media it produced', async () => {
    prisma.marketingMediaJob.findUnique.mockResolvedValue({
      id: 'job-1',
      status: 'SUCCEEDED',
      outputs: [
        { key: 'marketing/job-1/clip.mp4', contentType: 'video/mp4' },
        { key: 'marketing/job-1/still.png', contentType: 'image/png' },
      ],
    });

    await runAction({ intent: 'delete', jobId: 'job-1' });

    expect(prisma.marketingMediaJob.delete).toHaveBeenCalledWith({
      where: { id: 'job-1' },
    });
    expect(deleteSmallObject.mock.calls.map((call: any[]) => call[0])).toEqual([
      'marketing/job-1/clip.mp4',
      'marketing/job-1/still.png',
    ]);
  });

  // The renderer holds a claim on a job it is filming. Deleting the row out
  // from under it strands the worker mid-take and orphans whatever it uploads
  // next, so the delete waits rather than racing it.
  test('refuses while the renderer is filming it', async () => {
    prisma.marketingMediaJob.findUnique.mockResolvedValue({
      id: 'job-1',
      status: 'RENDERING',
      outputs: [],
    });

    const response = await runAction({ intent: 'delete', jobId: 'job-1' });

    expect(responseStatus(response)).toBe(409);
    expect(readData(response).error).toContain('being filmed');
    expect(prisma.marketingMediaJob.delete).not.toHaveBeenCalled();
    expect(deleteSmallObject).not.toHaveBeenCalled();
  });

  // A bucket that already lost the object must not strand a row in a list the
  // operator is trying to clear. Orphaned media costs storage; an undeletable
  // job is a broken screen.
  test('still deletes the job when its media has already gone', async () => {
    prisma.marketingMediaJob.findUnique.mockResolvedValue({
      id: 'job-1',
      status: 'FAILED',
      outputs: [{ key: 'marketing/job-1/clip.mp4', contentType: 'video/mp4' }],
    });
    deleteSmallObject.mockRejectedValue(new Error('NoSuchKey'));

    await runAction({ intent: 'delete', jobId: 'job-1' });

    expect(prisma.marketingMediaJob.delete).toHaveBeenCalledWith({
      where: { id: 'job-1' },
    });
  });

  test('reports a render that is already gone', async () => {
    prisma.marketingMediaJob.findUnique.mockResolvedValue(null);

    const response = await runAction({ intent: 'delete', jobId: 'job-1' });

    expect(responseStatus(response)).toBe(404);
    expect(prisma.marketingMediaJob.delete).not.toHaveBeenCalled();
  });
});

describe('render the showcase', () => {
  beforeEach(() => {
    requireAdmin.mockReset();
    requireAdmin.mockResolvedValue({ id: 'admin-1' });
    requireMutableRequest.mockReset();
    requireMarketingStudioEnabled.mockReset();
    getMarketingRenderTarget.mockReset();
    getMarketingRenderTarget.mockReturnValue('http://localhost:5176');
    prisma.marketingMediaJob.create.mockReset();
    prisma.marketingMediaJob.create.mockImplementation(async ({ data }: any) => ({
      id: `job-${data.subjectLabel}`,
    }));
  });

  // One click, the whole library: the gallery fills itself with every
  // hand-verified storyboard rather than asking for eight separate clicks.
  test('queues every library storyboard and returns to the studio', async () => {
    const { MARKETING_LIBRARY } = await import(
      '../../../../../packages/marketing-media'
    );

    const response: any = await runAction({ intent: 'render-showcase' });

    expect(prisma.marketingMediaJob.create).toHaveBeenCalledTimes(
      MARKETING_LIBRARY.length
    );
    const queued = prisma.marketingMediaJob.create.mock.calls.map(
      ([args]: any) => args.data
    );
    expect(queued.map((job: any) => job.subjectLabel)).toEqual(
      MARKETING_LIBRARY.map((entry) => entry.title)
    );
    expect(queued.every((job: any) => job.status === 'QUEUED')).toBe(true);
    expect(queued.every((job: any) => job.model === null)).toBe(true);
    expect(queued.every((job: any) => job.targetUrl === 'http://localhost:5176')).toBe(true);
    expect(responseStatus(response)).toBe(302);
    expect(response.headers.get('location')).toBe('/app/admin/marketing-media');
  });
});

describe('backdrop choice', () => {
  beforeEach(() => {
    requireAdmin.mockReset();
    requireAdmin.mockResolvedValue({ id: 'admin-1' });
    requireMutableRequest.mockReset();
    requireMarketingStudioEnabled.mockReset();
    getMarketingRenderTarget.mockReset();
    getMarketingRenderTarget.mockReturnValue('http://localhost:5176');
    prisma.marketingMediaJob.create.mockReset();
    prisma.marketingMediaJob.create.mockResolvedValue({ id: 'job-1' });
    generateStoryboard.mockReset();
    prisma.marketingMediaJob.update.mockReset();
  });

  // The brief says what to show; the backdrop says what it sits on. The model
  // never picks it — it is stamped onto whatever storyboard comes back.
  test('stamps the chosen backdrop onto a generated storyboard', async () => {
    generateStoryboard.mockResolvedValue({
      storyboard: { ...STORYBOARD, backdrop: 'gradient' },
      model: 'claude',
    });

    await runAction({
      brief: 'A teacher reviewing submitted work.',
      kind: 'STILLS',
      backdrop: 'paper',
    });

    const [[update]] = prisma.marketingMediaJob.update.mock.calls;
    expect(update.data.storyboard.backdrop).toBe('paper');
  });

  test('stamps it onto a pasted storyboard too', async () => {
    await runAction({
      brief: 'A teacher reviewing submitted work.',
      kind: 'STILLS',
      backdrop: 'slate',
      storyboardJson: JSON.stringify(STORYBOARD),
    });

    const [[created]] = prisma.marketingMediaJob.create.mock.calls;
    expect(created.data.storyboard.backdrop).toBe('slate');
  });

  test('a library render takes the backdrop without editing the library', async () => {
    await runAction({
      intent: 'render-library',
      librarySlug: 'library-teacher-grading-hub',
      backdrop: 'none',
    });

    const [[created]] = prisma.marketingMediaJob.create.mock.calls;
    expect(created.data.storyboard.backdrop).toBe('none');
  });

  test('defaults to the gradient when nothing is chosen', async () => {
    await runAction({
      intent: 'render-library',
      librarySlug: 'library-teacher-grading-hub',
    });

    const [[created]] = prisma.marketingMediaJob.create.mock.calls;
    expect(created.data.storyboard.backdrop).toBe('gradient');
  });

  test('rejects a backdrop that is not offered', async () => {
    const response: any = await runAction({
      brief: 'A teacher reviewing submitted work.',
      kind: 'STILLS',
      backdrop: 'chartreuse',
    });
    expect(responseStatus(response)).toBe(400);
  });
});
