import { beforeEach, describe, expect, mock, test } from 'bun:test';
import {
  DOCUMENT_IMAGE_MAX_BYTES,
  GBA300_EXPANSION_RUBRIC_NAME,
} from '~/domain/document-images/document-images';

const prisma = {
  user: { findUniqueOrThrow: mock() },
  document: { findFirst: mock() },
  documentImage: { create: mock() },
};

const requireUserId = mock();
const requireMembership = mock();

mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/auth.server', () => ({ requireUserId, requireMembership }));

const { action } = await import('./route');

function makeRequest(
  docId: string,
  {
    bytes = new Uint8Array([1, 2, 3, 4]),
    type = 'image/png',
    altText = 'Ten-year revenue for the global market',
    fileName = 'revenue.png',
    omitFile = false,
  }: {
    bytes?: Uint8Array;
    type?: string;
    altText?: string;
    fileName?: string;
    omitFile?: boolean;
  } = {}
) {
  const form = new FormData();
  if (!omitFile) {
    form.set('file', new File([bytes as unknown as BlobPart], fileName, { type }));
  }
  form.set('altText', altText);
  return new Request(`https://example.com/api/document/${docId}/image`, {
    method: 'POST',
    body: form,
  });
}

const gbaDocument = {
  id: 'doc-1',
  membershipId: 'profile-1',
  assignmentType: {
    allowsImageUploads: false,
    rubric: { name: GBA300_EXPANSION_RUBRIC_NAME },
  },
};

describe('api.document.$id.image', () => {
  beforeEach(() => {
    for (const model of Object.values(prisma)) {
      for (const fn of Object.values(model)) {
        (fn as ReturnType<typeof mock>).mockReset();
      }
    }
    requireUserId.mockReset();
    requireMembership.mockReset();
    delete process.env.DOCUMENT_IMAGE_UPLOAD_DISABLED;

    requireUserId.mockResolvedValue('user-1');
    requireMembership.mockResolvedValue({ id: 'profile-1' });
    prisma.user.findUniqueOrThrow.mockResolvedValue({ isAdmin: false });
    prisma.document.findFirst.mockResolvedValue(gbaDocument);
    prisma.documentImage.create.mockResolvedValue({
      id: 'img-1',
      altText: 'Ten-year revenue for the global market',
    });
  });

  test('stores the upload and returns a same-origin src', async () => {
    const response = await action({
      request: makeRequest('doc-1'),
      params: { id: 'doc-1' },
      context: {} as never,
    } as never);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({
      ok: true,
      id: 'img-1',
      src: '/api/image/document/img-1',
      altText: 'Ten-year revenue for the global market',
    });

    const createArgs = prisma.documentImage.create.mock.calls[0]![0];
    expect(createArgs.data.documentId).toBe('doc-1');
    expect(createArgs.data.contentType).toBe('image/png');
    expect(createArgs.data.byteSize).toBe(4);
    expect(createArgs.data.altText).toBe('Ten-year revenue for the global market');
    expect(Buffer.from(createArgs.data.blob)).toEqual(Buffer.from([1, 2, 3, 4]));
  });

  test('refuses a document the caller cannot reach', async () => {
    prisma.document.findFirst.mockResolvedValue(null);

    const response = await action({
      request: makeRequest('doc-1'),
      params: { id: 'doc-1' },
      context: {} as never,
    } as never);

    expect(response.status).toBe(403);
    expect(prisma.documentImage.create).not.toHaveBeenCalled();
  });

  test('refuses an assignment type outside the rollout', async () => {
    prisma.document.findFirst.mockResolvedValue({
      ...gbaDocument,
      assignmentType: { allowsImageUploads: false, rubric: { name: 'thesis-driven-essay' } },
    });

    const response = await action({
      request: makeRequest('doc-1'),
      params: { id: 'doc-1' },
      context: {} as never,
    } as never);

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ ok: false, reason: 'not-enabled' });
    expect(prisma.documentImage.create).not.toHaveBeenCalled();
  });

  test('accepts an assignment type that opted in without a linked rubric', async () => {
    prisma.document.findFirst.mockResolvedValue({
      ...gbaDocument,
      assignmentType: { allowsImageUploads: true, rubric: null },
    });

    const response = await action({
      request: makeRequest('doc-1'),
      params: { id: 'doc-1' },
      context: {} as never,
    } as never);

    expect(response.status).toBe(200);
    expect(prisma.documentImage.create).toHaveBeenCalled();
  });

  test('refuses everything once the kill switch is set', async () => {
    process.env.DOCUMENT_IMAGE_UPLOAD_DISABLED = 'true';

    const response = await action({
      request: makeRequest('doc-1'),
      params: { id: 'doc-1' },
      context: {} as never,
    } as never);

    expect(response.status).toBe(403);
    expect(prisma.documentImage.create).not.toHaveBeenCalled();
  });

  test('rejects a file type outside the allowlist', async () => {
    const response = await action({
      request: makeRequest('doc-1', { type: 'image/svg+xml', fileName: 'logo.svg' }),
      params: { id: 'doc-1' },
      context: {} as never,
    } as never);

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ ok: false, reason: 'unsupported-type' });
    expect(prisma.documentImage.create).not.toHaveBeenCalled();
  });

  test('rejects an oversized file without buffering it into the row', async () => {
    const response = await action({
      request: makeRequest('doc-1', {
        bytes: new Uint8Array(DOCUMENT_IMAGE_MAX_BYTES + 1),
      }),
      params: { id: 'doc-1' },
      context: {} as never,
    } as never);

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ ok: false, reason: 'too-large' });
    expect(prisma.documentImage.create).not.toHaveBeenCalled();
  });

  test('rejects an upload with no alt text', async () => {
    const response = await action({
      request: makeRequest('doc-1', { altText: '   ' }),
      params: { id: 'doc-1' },
      context: {} as never,
    } as never);

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ ok: false, reason: 'missing-alt-text' });
  });

  test('rejects a request with no file part', async () => {
    const response = await action({
      request: makeRequest('doc-1', { omitFile: true }),
      params: { id: 'doc-1' },
      context: {} as never,
    } as never);

    expect(response.status).toBe(400);
    expect(prisma.documentImage.create).not.toHaveBeenCalled();
  });

  test('scopes the document lookup to the caller when they are not an admin', async () => {
    await action({
      request: makeRequest('doc-1'),
      params: { id: 'doc-1' },
      context: {} as never,
    } as never);

    const where = prisma.document.findFirst.mock.calls[0]![0].where;
    expect(where.id).toBe('doc-1');
    expect(where.membershipId).toBe('profile-1');
    expect(where.deletedAt).toBeNull();
  });
});
