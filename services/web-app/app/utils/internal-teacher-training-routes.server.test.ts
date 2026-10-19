import { expect, mock, test } from 'bun:test';
mock.module('~/utils/db.server', () => ({ prisma: {} }));
const handle = mock(
  async (operation: string, _request: Request, ids: unknown) =>
    Response.json({ operation, ids })
);
mock.module('./internal-teacher-trainings.server', () => ({
  createInternalTeacherTrainingHandlers: () => ({ handle }),
}));
const routes = [
  ['', { GET: 'list', POST: 'create' }],
  ['.$id', { GET: 'detail', PATCH: 'update', DELETE: 'delete' }],
  ['.$id.image', { PUT: 'replaceImage', DELETE: 'removeImage' }],
  ['.$id.modules', { POST: 'createModule' }],
  ['.$id.modules.$moduleId', { PATCH: 'updateModule', DELETE: 'deleteModule' }],
  ['.$id.modules.order', { PUT: 'reorderModules' }],
  ['.$id.modules.$moduleId.video.upload-url', { POST: 'startVideo' }],
  ['.$id.modules.$moduleId.video.complete', { POST: 'completeVideo' }],
  ['.$id.modules.$moduleId.video', { DELETE: 'deleteVideo' }],
  ['.$id.modules.$moduleId.resources.upload-url', { POST: 'startResource' }],
  ['.$id.modules.$moduleId.resources.complete', { POST: 'completeResource' }],
  [
    '.$id.modules.$moduleId.resources.$resourceId',
    { DELETE: 'deleteResource' },
  ],
] as const;
for (const [suffix, methods] of routes)
  test(`route dispatch ${suffix || 'collection'}`, async () => {
    const route = await import(
      `../routes/api.internal.v1.admin.teacher-trainings${suffix}/route`
    );
    const params = { id: 'tt-1', moduleId: 'm-1', resourceId: 'r-1' };
    for (const method of ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS']) {
      const request = new Request(
        'https://yawp.test/api/internal/v1/admin/teacher-trainings',
        { method }
      );
      const result = await route[method === 'GET' ? 'loader' : 'action']({
        request,
        params,
      });
      const operation = (methods as Record<string, string>)[method];
      expect(result.status).toBe(operation ? 200 : 405);
      if (operation)
        expect(await result.json()).toEqual({ operation, ids: params });
      else {
        expect(await result.json()).toEqual({ error: 'Method not allowed' });
        expect(result.headers.get('cache-control')).toBe('no-store');
      }
    }
  });
