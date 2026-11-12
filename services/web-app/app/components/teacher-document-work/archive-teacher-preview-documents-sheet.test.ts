import { describe, expect, mock, test } from 'bun:test';

import { archiveTeacherPreviewDocuments } from './archive-teacher-preview-documents-sheet';

describe('archiveTeacherPreviewDocuments', () => {
  test('archives each document via the model document route', async () => {
    const fetchMock = mock(async (input: RequestInfo, init?: RequestInit) => {
      expect(String(input)).toMatch(/\/api\/model\/document\/doc-/);
      expect(init?.method).toBe('POST');
      const body = init?.body;
      expect(body).toBeInstanceOf(FormData);
      expect((body as FormData).get('action')).toBe('archive');
      return new Response(null, { status: 204 });
    });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchMock as typeof fetch;

    try {
      await archiveTeacherPreviewDocuments(['doc-1', 'doc-2']);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
