import { beforeEach, describe, expect, mock, test } from 'bun:test';

const requireAdmin = mock();
const requireMutableRequest = mock();
const requireMarketingStudioEnabled = mock();
const getMarketingRenderTarget = mock(() => 'http://localhost:5176');
const getSignedGetUrl = mock(async (key: string) => `https://s3.example/${key}`);
let mediaDir: string | null = '/media';

const prisma = {
  marketingMediaJob: {
    create: mock(),
    update: mock(),
    findMany: mock(),
    findUnique: mock(),
    findFirst: mock(),
    count: mock(),
    delete: mock(),
  },
  assignmentType: { findMany: mock(), findUnique: mock() },
};

mock.module('~/services/s3.server', () => ({
  deleteSmallObject: mock(),
  getSignedGetUrl,
}));
mock.module('~/utils/auth.server', () => ({ requireAdmin, requireMutableRequest }));
mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/marketing-studio.server', () => ({
  requireMarketingStudioEnabled,
  getMarketingRenderTarget,
  getMarketingMediaDir: () => mediaDir,
  isMarketingStudioEnabled: () => true,
}));
mock.module('~/services/marketing-storyboard.server', () => ({
  generateStoryboard: mock(),
  reviseStoryboard: mock(),
  StoryboardGenerationError: class extends Error {},
}));

const { loader, collectGalleryItems } = await import('./route');

const still = (key: string, label: string) => ({
  kind: 'IMAGE',
  key,
  contentType: 'image/png',
  bytes: 1_000,
  label,
  width: 2560,
  height: 1656,
});

const JOBS = [
  {
    id: 'job-new',
    kind: 'STILLS',
    status: 'SUCCEEDED',
    createdAt: new Date('2026-09-02T12:00:00Z'),
    finishedAt: new Date('2026-09-02T12:01:00Z'),
    subjectLabel: 'The teacher’s day at a glance',
    storyboard: { title: 'The teacher’s day at a glance' },
    outputs: [
      still('marketing-media/job-new/01-dashboard.png', 'dashboard'),
      still('marketing-media/job-new/01-dashboard-raw.png', 'dashboard (raw)'),
    ],
  },
  {
    id: 'job-old',
    kind: 'CLIP',
    status: 'SUCCEEDED',
    createdAt: new Date('2026-09-01T12:00:00Z'),
    finishedAt: new Date('2026-09-01T12:02:00Z'),
    subjectLabel: null,
    storyboard: { title: 'Feedback students actually see' },
    outputs: [
      {
        kind: 'VIDEO',
        key: 'marketing-media/job-old/feedback.mp4',
        contentType: 'video/mp4',
        bytes: 900_000,
        label: 'Feedback students actually see',
        width: 1280,
        height: 928,
        durationMs: 9_400,
      },
      still('marketing-media/job-old/01-graded.png', 'graded-submission'),
    ],
  },
];

describe('collectGalleryItems', () => {
  // The gallery is the finished work, one card per file, newest first. The
  // raw captures kept beside framed stills are working files, not the show;
  // they stay reachable from the job page.
  test('flattens finished outputs newest first, hiding raw captures', () => {
    const items = collectGalleryItems(JOBS as never, (jobId, key) => `/f/${jobId}/${key.split('/').at(-1)}`);

    expect(items.map((item) => item.label)).toEqual([
      'dashboard',
      'Feedback students actually see',
      'graded-submission',
    ]);
    expect(items[0]).toMatchObject({
      jobId: 'job-new',
      jobTitle: 'The teacher’s day at a glance',
      kind: 'IMAGE',
      url: '/f/job-new/01-dashboard.png',
    });
    expect(items[1]).toMatchObject({ kind: 'VIDEO', durationMs: 9_400 });
  });

  test('keeps a raw capture that has no framed counterpart', () => {
    const items = collectGalleryItems(
      [
        {
          ...JOBS[0],
          outputs: [still('marketing-media/job-new/01-dashboard-raw.png', 'dashboard (raw)')],
        },
      ] as never,
      (_jobId, key) => key
    );
    expect(items).toHaveLength(1);
  });
});

describe('gallery loader', () => {
  beforeEach(() => {
    requireAdmin.mockReset();
    requireMarketingStudioEnabled.mockReset();
    prisma.marketingMediaJob.findMany.mockReset();
    getSignedGetUrl.mockClear();
    mediaDir = '/media';
  });

  async function runLoader(url = 'http://localhost/app/admin/marketing-media/gallery') {
    return loader({ request: new Request(url), params: {}, context: {} as never } as never);
  }

  test('is gated like the rest of the studio', async () => {
    prisma.marketingMediaJob.findMany.mockResolvedValue([]);
    await runLoader();
    expect(requireMarketingStudioEnabled).toHaveBeenCalled();
    expect(requireAdmin).toHaveBeenCalled();
  });

  test('asks only for finished jobs with media', async () => {
    prisma.marketingMediaJob.findMany.mockResolvedValue([]);
    await runLoader();
    const args = prisma.marketingMediaJob.findMany.mock.calls[0][0];
    expect(args.where).toMatchObject({ status: 'SUCCEEDED' });
    expect(args.orderBy).toEqual({ finishedAt: 'desc' });
  });

  test('serves disk media through the admin file route', async () => {
    prisma.marketingMediaJob.findMany.mockResolvedValue(JOBS);
    const response: any = await runLoader();
    const data = response.data ?? response;
    expect(data.items[0].url).toBe('/app/admin/marketing-media/job-new/file/01-dashboard.png');
    expect(getSignedGetUrl).not.toHaveBeenCalled();
    expect(data.counts).toEqual({ all: 3, stills: 2, clips: 1 });
  });

  test('signs S3 media when there is no disk store', async () => {
    mediaDir = null;
    prisma.marketingMediaJob.findMany.mockResolvedValue(JOBS);
    const response: any = await runLoader();
    const data = response.data ?? response;
    expect(data.items[0].url).toBe('https://s3.example/marketing-media/job-new/01-dashboard.png');
  });
});
