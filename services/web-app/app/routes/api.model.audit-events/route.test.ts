import { beforeEach, describe, expect, mock, test } from 'bun:test';

const recordAuditEvent = mock();

mock.module('~/utils/audit.server', () => ({
  recordAuditEvent,
}));

const { action } = await import('./route');

describe('api.model.audit-events', () => {
  beforeEach(() => {
    recordAuditEvent.mockReset();
  });

  test('persists a batch of browser audit events', async () => {
    const response = (await action({
      request: new Request('https://example.com/api/model/audit-events', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          events: [
            {
              eventType: 'page_view',
              userId: 'user-1',
              profileId: 'profile-1',
              documentId: 'doc-1',
              metadata: {
                replayUrl: 'https://posthog.example/replay',
              },
            },
            {
              eventType: 'document.editor_open',
              userId: 'user-1',
              profileId: 'profile-1',
              documentId: 'doc-1',
              editorSessionId: 'editor-1',
              payload: {
                html: '<p>secret draft</p>',
              },
            },
          ],
        }),
      }),
    } as any)) as { data: { ok: boolean; accepted: number } };

    expect(response.data).toMatchObject({
      ok: true,
      accepted: 2,
    });
    expect(recordAuditEvent).toHaveBeenCalledTimes(2);
    expect(recordAuditEvent.mock.calls[0]?.[0]).toMatchObject({
      source: 'browser',
      eventType: 'page_view',
      userId: 'user-1',
      documentId: 'doc-1',
    });
    expect(recordAuditEvent.mock.calls[1]?.[0]).toMatchObject({
      source: 'browser',
      eventType: 'document.editor_open',
      userId: 'user-1',
      documentId: 'doc-1',
      editorSessionId: 'editor-1',
      payload: {
        html: '<p>secret draft</p>',
      },
    });
  });
});
