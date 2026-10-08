import { beforeEach, describe, expect, mock, test } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const requireAdmin = mock();
const requireMarketingStudioEnabled = mock();
const getMarketingMediaDir = mock();

const prisma = {
  marketingMediaJob: { findUnique: mock() },
};

mock.module('~/utils/auth.server', () => ({
  requireAdmin,
  requireMutableRequest: mock(),
}));
mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/marketing-studio.server', () => ({
  requireMarketingStudioEnabled,
  getMarketingMediaDir,
  isMarketingStudioEnabled: () => true,
  getMarketingRenderTarget: () => 'https://demo.yawp.test',
}));

const { loader } = await import('./route');

const args = (name: string) =>
  ({
    request: new Request('http://localhost/x'),
    params: { jobId: 'job-1', name },
    context: {} as never,
  }) as never;

describe('marketing media file route', () => {
  let mediaDir: string;

  beforeEach(() => {
    requireAdmin.mockReset();
    requireMarketingStudioEnabled.mockReset();
    getMarketingMediaDir.mockReset();
    prisma.marketingMediaJob.findUnique.mockReset();

    requireAdmin.mockResolvedValue({ id: 'admin-1' });
    requireMarketingStudioEnabled.mockReturnValue(undefined);

    mediaDir = fs.mkdtempSync(path.join(os.tmpdir(), 'media-route-'));
    getMarketingMediaDir.mockReturnValue(mediaDir);

    const stored = path.join(mediaDir, 'marketing-media/job-1');
    fs.mkdirSync(stored, { recursive: true });
    fs.writeFileSync(path.join(stored, '01-shot.png'), 'png bytes');

    prisma.marketingMediaJob.findUnique.mockResolvedValue({
      outputs: [
        {
          kind: 'IMAGE',
          key: 'marketing-media/job-1/01-shot.png',
          contentType: 'image/png',
          bytes: 9,
          label: 'shot',
        },
      ],
    });
  });

  test('serves a recorded output with its content type', async () => {
    const response = (await loader(args('01-shot.png'))) as Response;

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/png');
    expect(await response.text()).toBe('png bytes');
  });

  // A guide is generated HTML served from the app's own origin. It needs no
  // script and nothing from the network, so it gets neither.
  test('serves a guide page sandboxed, with no scripts or network', async () => {
    const stored = path.join(mediaDir, 'marketing-media/job-1');
    fs.writeFileSync(path.join(stored, 'guide.html'), '<!doctype html>');
    prisma.marketingMediaJob.findUnique.mockResolvedValue({
      outputs: [
        {
          kind: 'DOCUMENT',
          key: 'marketing-media/job-1/guide.html',
          contentType: 'text/html; charset=utf-8',
          bytes: 15,
          label: 'Guide',
        },
      ],
    });

    const response = (await loader(args('guide.html'))) as Response;

    const csp = response.headers.get('content-security-policy') ?? '';
    expect(csp).toContain('sandbox');
    expect(csp).toContain("default-src 'none'");
    expect(csp).not.toContain('allow-scripts');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  });

  test('404s for a name that is not among the job outputs', async () => {
    expect(loader(args('secrets.env'))).rejects.toBeInstanceOf(Response);
  });

  test('a traversal-shaped name cannot escape the media directory', async () => {
    fs.writeFileSync(path.join(mediaDir, 'outside.txt'), 'outside');

    expect(loader(args('../../outside.txt'))).rejects.toBeInstanceOf(Response);
  });

  test('404s when disk storage is not configured', async () => {
    getMarketingMediaDir.mockReturnValue(null);

    expect(loader(args('01-shot.png'))).rejects.toBeInstanceOf(Response);
  });

  test('404s for an unknown job', async () => {
    prisma.marketingMediaJob.findUnique.mockResolvedValue(null);

    expect(loader(args('01-shot.png'))).rejects.toBeInstanceOf(Response);
  });
});
