import { describe, expect, mock, test } from 'bun:test';
import { uploadDocumentImage } from './upload-document-image';

function makeFile() {
  return new File([new Uint8Array([1, 2, 3])], 'chart.png', { type: 'image/png' });
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('uploadDocumentImage', () => {
  test('posts the file and alt text to the document endpoint', async () => {
    const fetchImpl = mock(async () =>
      jsonResponse({ ok: true, id: 'img-1', src: '/api/image/document/img-1', altText: 'Chart' })
    );

    const result = await uploadDocumentImage({
      documentId: 'doc-1',
      file: makeFile(),
      altText: 'Chart',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result).toEqual({
      ok: true,
      image: { id: 'img-1', src: '/api/image/document/img-1', altText: 'Chart' },
    });

    const [url, init] = fetchImpl.mock.calls[0]! as unknown as [string, RequestInit];
    expect(url).toBe('/api/document/doc-1/image');
    expect(init.method).toBe('POST');
    const form = init.body as FormData;
    expect(form.get('altText')).toBe('Chart');
    expect((form.get('file') as File).name).toBe('chart.png');
  });

  test('builds the src from the returned id rather than trusting the wire', async () => {
    const fetchImpl = mock(async () =>
      jsonResponse({ ok: true, id: 'img-2', src: 'https://evil.example.com/x.png', altText: 'X' })
    );

    const result = await uploadDocumentImage({
      documentId: 'doc-1',
      file: makeFile(),
      altText: 'X',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result.ok === true && result.image.src).toBe('/api/image/document/img-2');
  });

  test('surfaces the server message when the upload is rejected', async () => {
    const fetchImpl = mock(async () =>
      jsonResponse({ ok: false, reason: 'too-large', message: 'That image is too large.' }, 400)
    );

    const result = await uploadDocumentImage({
      documentId: 'doc-1',
      file: makeFile(),
      altText: 'Chart',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result).toEqual({ ok: false, message: 'That image is too large.' });
  });

  test('falls back to a generic message when the server answers with non-JSON', async () => {
    const fetchImpl = mock(async () => new Response('<html>502</html>', { status: 502 }));

    const result = await uploadDocumentImage({
      documentId: 'doc-1',
      file: makeFile(),
      altText: 'Chart',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.message).toBe("That image didn't upload. Try again.");
  });

  test('survives a dropped connection', async () => {
    const fetchImpl = mock(async () => {
      throw new Error('network down');
    });

    const result = await uploadDocumentImage({
      documentId: 'doc-1',
      file: makeFile(),
      altText: 'Chart',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result.ok).toBe(false);
  });
});
