import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  apHistoryCustomSourceImage: { create: mock() },
};
const requireUserId = mock();
const requireMembership = mock();

mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/auth.server', () => ({
  requireUserId,
  requireMembership,
}));

const { action } = await import('./route');

function uploadRequest(file: File | null, altText?: string) {
  const form = new FormData();
  if (file) form.append('file', file);
  if (altText) form.append('altText', altText);
  return new Request('https://example.com/api/ap-history/upload-source-image', {
    method: 'POST',
    body: form,
  });
}

async function readBody(response: any) {
  return typeof response.json === 'function' ? response.json() : response.data;
}

describe('api.ap-history.upload-source-image', () => {
  beforeEach(() => {
    prisma.apHistoryCustomSourceImage.create.mockReset();
    requireUserId.mockReset();
    requireMembership.mockReset();
    requireUserId.mockResolvedValue('user-1');
    requireMembership.mockResolvedValue({ id: 'teacher-1', role: 'TEACHER' });
    prisma.apHistoryCustomSourceImage.create.mockResolvedValue({ id: 'img-1' });
  });

  test('stores an uploaded image and returns a self-hosted url', async () => {
    const file = new File([new Uint8Array([1, 2, 3])], 'cartoon.png', {
      type: 'image/png',
    });

    const response = await action({
      request: uploadRequest(file, 'A political cartoon'),
    } as any);

    const body = await readBody(response);
    expect(body.success).toBe(true);
    expect(body.url).toBe(`/api/image/ap-history-upload/${body.key}`);
    expect(body.key).toMatch(/^upload-/);
    const createArg = prisma.apHistoryCustomSourceImage.create.mock.calls[0][0];
    expect(createArg.data.contentType).toBe('image/png');
    expect(createArg.data.altText).toBe('A political cartoon');
    expect(Buffer.isBuffer(createArg.data.blob)).toBe(true);
  });

  test('rejects a non-image file', async () => {
    const file = new File(['%PDF'], 'doc.pdf', { type: 'application/pdf' });

    const response = await action({
      request: uploadRequest(file),
    } as any);

    const body = await readBody(response);
    expect(body.success).toBe(false);
    expect(prisma.apHistoryCustomSourceImage.create).not.toHaveBeenCalled();
  });

  test('rejects non-teachers', async () => {
    requireMembership.mockResolvedValue({ id: 'student-1', role: 'STUDENT' });
    const file = new File([new Uint8Array([1])], 'x.png', {
      type: 'image/png',
    });

    const response = await action({
      request: uploadRequest(file),
    } as any);

    const body = await readBody(response);
    expect(body.success).toBe(false);
    expect(prisma.apHistoryCustomSourceImage.create).not.toHaveBeenCalled();
  });
});
