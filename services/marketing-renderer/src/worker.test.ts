import { beforeEach, describe, expect, mock, test } from 'bun:test';

const renderStoryboard = mock();
const uploadRenderedFiles = mock();
const createS3Client = mock();

mock.module('./render', () => ({ renderStoryboard }));
mock.module('./s3', () => ({ uploadRenderedFiles, createS3Client }));

const { processNextJob } = await import('./worker');

const STORYBOARD = {
  slug: 'teacher-loop',
  title: 'The teacher loop',
  persona: 'teacher',
  viewport: { width: 1440, height: 900 },
  scenes: [
    {
      id: 'dashboard',
      goto: '/app',
      waitFor: 'main',
      settle: 0.8,
      steps: [],
      hold: 1.5,
      screenshot: true,
      fullPage: false,
    },
  ],
};

const CONFIG = {
  databaseUrl: 'postgresql://localhost/demo',
  targetUrl: 'https://demo.yawp.test',
  bucket: 'yawp-videos',
  region: 'us-east-1',
  workerId: 'worker-1',
  pollIntervalMs: 5000,
  ffmpegPath: 'ffmpeg',
  loginPath: '/auth/dev-login',
};

const prisma = {
  marketingMediaJob: {
    findFirst: mock(),
    updateMany: mock(),
    update: mock(),
  },
};

function queuedJob(overrides: Record<string, unknown> = {}) {
  return {
    id: 'job-1',
    kind: 'STILLS',
    status: 'QUEUED',
    attempts: 0,
    storyboard: STORYBOARD,
    targetUrl: 'https://demo.yawp.test',
    ...overrides,
  };
}

function run() {
  return processNextJob({
    prisma: prisma as never,
    config: CONFIG as never,
    s3: {} as never,
  });
}

describe('processNextJob', () => {
  beforeEach(() => {
    renderStoryboard.mockReset();
    uploadRenderedFiles.mockReset();
    prisma.marketingMediaJob.findFirst.mockReset();
    prisma.marketingMediaJob.updateMany.mockReset();
    prisma.marketingMediaJob.update.mockReset();

    prisma.marketingMediaJob.updateMany.mockResolvedValue({ count: 1 });
    prisma.marketingMediaJob.update.mockResolvedValue({});
  });

  test('does nothing when the queue is empty', async () => {
    prisma.marketingMediaJob.findFirst.mockResolvedValue(null);

    expect(await run()).toBe('idle');
    expect(renderStoryboard).not.toHaveBeenCalled();
  });

  test('renders a claimed job and records the uploaded outputs', async () => {
    prisma.marketingMediaJob.findFirst.mockResolvedValue(queuedJob());
    renderStoryboard.mockResolvedValue({
      files: [
        {
          path: '/tmp/x/01-dashboard.png',
          kind: 'IMAGE',
          label: 'dashboard',
          contentType: 'image/png',
        },
      ],
      warnings: [],
    });
    uploadRenderedFiles.mockResolvedValue([
      {
        kind: 'IMAGE',
        key: 'marketing-media/job-1/01-dashboard.png',
        contentType: 'image/png',
        bytes: 10,
        label: 'dashboard',
      },
    ]);

    expect(await run()).toBe('rendered');

    const finalUpdate =
      prisma.marketingMediaJob.update.mock.calls.at(-1)?.[0].data;
    expect(finalUpdate.status).toBe('SUCCEEDED');
    expect(finalUpdate.outputs).toHaveLength(1);
  });

  test('films the worker target, not a target named by the queue', async () => {
    prisma.marketingMediaJob.findFirst.mockResolvedValue(
      queuedJob({ targetUrl: 'https://app.yawp.com' })
    );
    renderStoryboard.mockResolvedValue({
      files: [
        {
          path: '/tmp/x/01.png',
          kind: 'IMAGE',
          label: 'x',
          contentType: 'image/png',
        },
      ],
      warnings: [],
    });
    uploadRenderedFiles.mockResolvedValue([]);

    await run();

    expect(renderStoryboard.mock.calls[0][0].baseUrl).toBe(
      'https://demo.yawp.test'
    );
  });

  test('records a render failure against the job', async () => {
    prisma.marketingMediaJob.findFirst.mockResolvedValue(queuedJob());
    renderStoryboard.mockRejectedValue(new Error('navigation timeout'));

    expect(await run()).toBe('failed');

    const finalUpdate =
      prisma.marketingMediaJob.update.mock.calls.at(-1)?.[0].data;
    expect(finalUpdate.error).toContain('navigation timeout');
    expect(finalUpdate.status).toBe('QUEUED');
  });

  test('treats an empty render as a failure rather than a success', async () => {
    prisma.marketingMediaJob.findFirst.mockResolvedValue(queuedJob());
    renderStoryboard.mockResolvedValue({ files: [], warnings: [] });

    expect(await run()).toBe('failed');
    expect(uploadRenderedFiles).not.toHaveBeenCalled();

    const finalUpdate =
      prisma.marketingMediaJob.update.mock.calls.at(-1)?.[0].data;
    expect(finalUpdate.error).toContain('no media');
  });

  test('marks the job failed for good once attempts run out', async () => {
    prisma.marketingMediaJob.findFirst.mockResolvedValue(
      queuedJob({ attempts: 2 })
    );
    renderStoryboard.mockRejectedValue(new Error('navigation timeout'));

    await run();

    const finalUpdate =
      prisma.marketingMediaJob.update.mock.calls.at(-1)?.[0].data;
    expect(finalUpdate.status).toBe('FAILED');
  });
});
