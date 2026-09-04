import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { redirect } from 'react-router';

const prisma = { teacherTrainingModuleResource: { findUnique: mock() } };
const requireUserId = mock();

mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/auth.server', () => ({ requireUserId }));

const { loader } = await import('./route');

function resourceRequest() {
  return new Request(
    'https://example.com/api/teacher-training-module-resource/resource-1'
  );
}

describe('api.teacher-training-module-resource.$id', () => {
  beforeEach(() => {
    prisma.teacherTrainingModuleResource.findUnique.mockReset();
    requireUserId.mockReset();

    requireUserId.mockResolvedValue('user-1');
    prisma.teacherTrainingModuleResource.findUnique.mockResolvedValue({
      name: 'handout.pdf',
      contentType: 'application/pdf',
      blob: Buffer.from('curriculum handout'),
    });
  });

  test('refuses to serve the handout to a caller with no session', async () => {
    requireUserId.mockImplementation(() => {
      throw redirect('/auth/login');
    });

    await expect(
      loader({
        request: resourceRequest(),
        params: { id: 'resource-1' },
      } as any)
    ).rejects.toBeDefined();

    expect(
      prisma.teacherTrainingModuleResource.findUnique
    ).not.toHaveBeenCalled();
  });

  test('serves the handout to a logged-in caller', async () => {
    const response = (await loader({
      request: resourceRequest(),
      params: { id: 'resource-1' },
    } as any)) as Response;

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('application/pdf');
    expect(response.headers.get('Content-Disposition')).toContain(
      'handout.pdf'
    );
    expect(await response.text()).toBe('curriculum handout');
  });

  test('does not let a shared proxy cache the handout', async () => {
    const response = (await loader({
      request: resourceRequest(),
      params: { id: 'resource-1' },
    } as any)) as Response;

    expect(response.headers.get('Cache-Control')).toContain('private');
    expect(response.headers.get('Cache-Control')).not.toContain('public');
  });
});
