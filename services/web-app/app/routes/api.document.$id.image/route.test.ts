import { beforeEach, describe, expect, mock, test } from 'bun:test';
import {
  DOCUMENT_IMAGE_MAX_BYTES,
  DOCUMENT_IMAGE_MAX_PER_DOCUMENT,
  GBA300_EXPANSION_RUBRIC_NAME,
} from '~/domain/document-images/document-images';

/** A real PNG signature: the route stores the format the bytes claim, not the header. */
const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const prisma = {
  user: { findUniqueOrThrow: mock() },
  document: { findFirst: mock() },
  documentImage: { create: mock(), count: mock() },
};

const requireUserId = mock();
const requireMembership = mock();

mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/auth.server', () => ({ requireUserId, requireMembership }));

const { action } = await import('./route');

function makeRequest(
  docId: string,
  {
    bytes = PNG_BYTES,
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
    prisma.documentImage.count.mockResolvedValue(0);
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
    expect(createArgs.data.byteSize).toBe(PNG_BYTES.byteLength);
    expect(createArgs.data.altText).toBe('Ten-year revenue for the global market');
    expect(Buffer.from(createArgs.data.blob)).toEqual(Buffer.from(PNG_BYTES));
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

  test('refuses bytes that are not really an image, whatever the part header says', async () => {
    const response = await action({
      request: makeRequest('doc-1', {
        bytes: new TextEncoder().encode('<script>alert(document.cookie)</script>'),
        type: 'image/png',
        fileName: 'chart.png',
      }),
      params: { id: 'doc-1' },
      context: {} as never,
    } as never);

    expect(response.status).toBe(400);
    expect((await response.json()).reason).toBe('unsupported-type');
    expect(prisma.documentImage.create).not.toHaveBeenCalled();
  });

  test('stores the sniffed format rather than the declared one', async () => {
    const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

    await action({
      request: makeRequest('doc-1', { bytes: JPEG, type: 'image/png' }),
      params: { id: 'doc-1' },
      context: {} as never,
    } as never);

    expect(prisma.documentImage.create.mock.calls[0]![0].data.contentType).toBe('image/jpeg');
  });

  test('rejects an oversized body before parsing it into memory', async () => {
    const request = makeRequest('doc-1');
    // What a browser sends ahead of a body far past the cap. The route has to
    // answer from the header, because formData() would buffer the whole thing.
    request.headers.set('Content-Length', String(DOCUMENT_IMAGE_MAX_BYTES * 20));

    const response = await action({
      request,
      params: { id: 'doc-1' },
      context: {} as never,
    } as never);

    expect(response.status).toBe(413);
    expect((await response.json()).reason).toBe('too-large');
    expect(prisma.documentImage.create).not.toHaveBeenCalled();
  });

  test('stops a document that already carries the maximum number of figures', async () => {
    prisma.documentImage.count.mockResolvedValue(DOCUMENT_IMAGE_MAX_PER_DOCUMENT);

    const response = await action({
      request: makeRequest('doc-1'),
      params: { id: 'doc-1' },
      context: {} as never,
    } as never);

    expect(response.status).toBe(400);
    expect((await response.json()).reason).toBe('too-many');
    expect(prisma.documentImage.create).not.toHaveBeenCalled();
    expect(prisma.documentImage.count.mock.calls[0]![0].where).toEqual({
      documentId: 'doc-1',
      deletedAt: null,
    });
  });
});
