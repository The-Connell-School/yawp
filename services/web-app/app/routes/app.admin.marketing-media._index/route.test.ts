import { beforeEach, describe, expect, mock, test } from 'bun:test';

const requireAdmin = mock();
const requireMutableRequest = mock();
const generateStoryboard = mock();
const requireMarketingStudioEnabled = mock();
const getMarketingRenderTarget = mock();

class StoryboardGenerationError extends Error {}

const prisma = {
  marketingMediaJob: { create: mock(), update: mock(), findMany: mock() },
  assignmentType: { findMany: mock(), findUnique: mock() },
};

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
mock.module('~/services/marketing-storyboard.server', () => ({
  generateStoryboard,
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
