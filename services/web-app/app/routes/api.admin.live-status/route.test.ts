import { beforeEach, describe, expect, mock, test } from 'bun:test';

const requireAdmin = mock();
const prisma = {
  $queryRaw: mock(),
};

mock.module('~/utils/auth.server', () => ({
  requireAdmin,
}));

mock.module('~/utils/db.server', () => ({ prisma }));

const { loader } = await import('./route');

describe('api.admin.live-status', () => {
  beforeEach(() => {
    requireAdmin.mockReset();
    prisma.$queryRaw.mockReset();

    requireAdmin.mockResolvedValue({ id: 'admin-1' });
    prisma.$queryRaw.mockResolvedValue([{ ok: 1 }]);
  });

  test('blocks non-admin users', async () => {
    requireAdmin.mockRejectedValue(new Response('Forbidden', { status: 403 }));

    let thrown: Response | null = null;
    try {
      await loader({
        request: new Request('https://example.test/api/admin/live-status'),
        params: {},
        context: {} as never,
      } as any);
    } catch (error) {
      thrown = error as Response;
    }

    expect(thrown?.status).toBe(403);
  });

  test('returns current backend and database health for admins', async () => {
    const response = (await loader({
      request: new Request('https://example.test/api/admin/live-status'),
      params: {},
      context: {} as never,
    } as any)) as { data: any };

    expect(response.data).toMatchObject({
      status: 'ok',
      database: { status: 'ok' },
      runtime: {
        nodeVersion: expect.stringMatching(/^v/),
      },
    });
    expect(Date.parse(response.data.serverTime)).not.toBeNaN();
    expect(response.data.runtime.uptimeSeconds).toBeGreaterThanOrEqual(0);
    expect(response.data.runtime.memory.heapUsedMb).toBeGreaterThan(0);
    expect(response.data.database.latencyMs).toBeGreaterThanOrEqual(0);
  });

  test('reports degraded health when the database check fails', async () => {
    prisma.$queryRaw.mockRejectedValue(new Error('database unavailable'));

    const response = (await loader({
      request: new Request('https://example.test/api/admin/live-status'),
      params: {},
      context: {} as never,
    } as any)) as { data: any };

    expect(response.data).toMatchObject({
      status: 'degraded',
      database: { status: 'error' },
    });
    expect(response.data.database.error).toContain('database unavailable');
  });
});
