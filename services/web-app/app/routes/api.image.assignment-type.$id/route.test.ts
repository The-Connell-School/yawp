import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { redirect } from 'react-router';

const prisma = { assignmentTypeImage: { findUnique: mock() } };
const requireUserId = mock();

mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/db.server.ts', () => ({ prisma }));
mock.module('~/utils/auth.server', () => ({ requireUserId }));
mock.module('~/utils/auth.server.ts', () => ({ requireUserId }));

const { loader } = await import('./route');
const { loader: courseLoader } = await import('../api.image.course.$id/route');

function imageRequest() {
  return new Request('https://example.com/api/image/assignment-type/image-1');
}

describe('api.image.assignment-type.$id', () => {
  beforeEach(() => {
    prisma.assignmentTypeImage.findUnique.mockReset();
    requireUserId.mockReset();

    requireUserId.mockResolvedValue('user-1');
    prisma.assignmentTypeImage.findUnique.mockResolvedValue({
      contentType: 'image/png',
      blob: Buffer.from('not-really-a-png'),
    });
  });

  test('refuses to serve the blob to a caller with no session', async () => {
    requireUserId.mockImplementation(() => {
      throw redirect('/auth/login');
    });

    await expect(
      loader({ request: imageRequest(), params: { id: 'image-1' } } as any)
    ).rejects.toBeDefined();

    expect(prisma.assignmentTypeImage.findUnique).not.toHaveBeenCalled();
  });

  test('serves the blob to a logged-in caller', async () => {
    const response = (await loader({
      request: imageRequest(),
      params: { id: 'image-1' },
    } as any)) as Response;

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('image/png');
    expect(await response.text()).toBe('not-really-a-png');
  });

  test('does not let a shared proxy cache the blob', async () => {
    const response = (await loader({
      request: imageRequest(),
      params: { id: 'image-1' },
    } as any)) as Response;

    expect(response.headers.get('Cache-Control')).toContain('private');
    expect(response.headers.get('Cache-Control')).not.toContain('public');
  });

  test('the /api/image/course alias is the same guarded loader', () => {
    expect(courseLoader).toBe(loader);
  });
});
