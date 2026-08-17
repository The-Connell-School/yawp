import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import { createHmac } from 'node:crypto';
import { prosemirrorToYXmlFragment } from 'y-prosemirror';
import * as Y from 'yjs';
import { getSchema } from '@tiptap/core';
import { Node as PMNode } from '@tiptap/pm/model';

const applyCollabSnapshot = mock();

mock.module('~/domain/collaboration/dual-write.server', () => ({
  applyCollabSnapshot,
}));

const { action } = await import('./route');
const { collaborativeSchemaExtensions, COLLAB_FRAGMENT_FIELD } = await import(
  '~/domain/collaboration/schema'
);

afterAll(() => {
  mock.restore();
});

const SECRET = 'test-collab-secret';
const schema = getSchema(collaborativeSchemaExtensions);

async function readBody(response: any) {
  return typeof response.json === 'function' ? response.json() : response.data;
}

function responseStatus(response: any) {
  return response.status ?? response.init?.status;
}

/** A base64 Yjs state update containing one paragraph, built the way the browser does. */
function stateFor(text: string): string {
  const ydoc = new Y.Doc();
  const node = PMNode.fromJSON(schema, {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
  });
  prosemirrorToYXmlFragment(node, ydoc.getXmlFragment(COLLAB_FRAGMENT_FIELD));
  return Buffer.from(Y.encodeStateAsUpdate(ydoc)).toString('base64');
}

const post = (
  payload: unknown,
  { signature, secret = SECRET }: { signature?: string; secret?: string } = {}
) => {
  const rawBody = typeof payload === 'string' ? payload : JSON.stringify(payload);
  const sig =
    signature ??
    `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`;

  return action({
    request: new Request('https://example.com/api/collab/webhook', {
      method: 'POST',
      body: rawBody,
      headers: { 'x-hub-signature-256': sig, 'content-type': 'application/json' },
    }),
    params: {},
  } as any);
};

describe('api.collab.webhook', () => {
  beforeEach(() => {
    process.env.TIPTAP_COLLAB_SECRET = SECRET;
    applyCollabSnapshot
      .mockReset()
      .mockResolvedValue({ status: 'written', revision: 5 });
  });

  describe('signature', () => {
    test('rejects a request with no signature', async () => {
      const response = await post({ name: 'doc-1' }, { signature: '' });

      expect(responseStatus(response)).toBe(401);
      expect(applyCollabSnapshot).not.toHaveBeenCalled();
    });

    test('rejects a signature computed with the wrong secret', async () => {
      const response = await post(
        { name: 'doc-1', event: 'change', state: stateFor('hi') },
        { secret: 'not-the-secret' }
      );

      expect(responseStatus(response)).toBe(401);
      expect(applyCollabSnapshot).not.toHaveBeenCalled();
    });

    test('rejects a valid signature over different bytes', async () => {
      // Signature computed over a different body: the classic replay-with-edits
      // attempt, and the reason the raw text is signed rather than a reparse.
      const signature = `sha256=${createHmac('sha256', SECRET)
        .update(JSON.stringify({ name: 'doc-other' }))
        .digest('hex')}`;

      const response = await post(
        { name: 'doc-1', event: 'change', state: stateFor('hi') },
        { signature }
      );

      expect(responseStatus(response)).toBe(401);
    });

    test('rejects a non-hex signature without throwing', async () => {
      const response = await post({ name: 'doc-1' }, { signature: 'sha256=zzzz' });

      expect(responseStatus(response)).toBe(401);
    });

    test('accepts a bare hex digest without the sha256 prefix', async () => {
      const rawBody = JSON.stringify({
        name: 'doc-1',
        event: 'change',
        state: stateFor('hello'),
      });
      const signature = createHmac('sha256', SECRET).update(rawBody).digest('hex');

      const response = await post(rawBody, { signature });

      expect(responseStatus(response) ?? 200).toBe(200);
      expect(applyCollabSnapshot).toHaveBeenCalled();
    });

    test('fails closed when the server has no secret configured', async () => {
      delete process.env.TIPTAP_COLLAB_SECRET;

      const response = await post({ name: 'doc-1' });

      expect(responseStatus(response)).toBe(500);
      expect(applyCollabSnapshot).not.toHaveBeenCalled();
    });
  });

  describe('state handling', () => {
    test('decodes a Yjs state update and dual-writes the snapshot', async () => {
      await post({
        name: 'doc-1',
        event: 'change',
        state: stateFor('Written by the group.'),
        userId: 'member-3',
      });

      expect(applyCollabSnapshot).toHaveBeenCalledTimes(1);
      const args = applyCollabSnapshot.mock.calls[0][0];
      expect(args.documentId).toBe('doc-1');
      expect(args.snapshot.text).toBe('Written by the group.');
      expect(args.snapshot.html).toContain('Written by the group.');
      expect(args.membershipId).toBe('member-3');
    });

    test('accepts ProseMirror JSON content as an alternative shape', async () => {
      await post({
        name: 'doc-1',
        event: 'change',
        content: {
          type: 'doc',
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'From JSON.' }] },
          ],
        },
      });

      expect(applyCollabSnapshot.mock.calls[0][0].snapshot.text).toBe('From JSON.');
    });

    test('ignores a presence event rather than erroring', async () => {
      // Most webhook traffic. Treating it as an error would make the provider
      // retry forever.
      const response = await post({ name: 'doc-1', event: 'awarenessUpdate' });
      const body = await readBody(response);

      expect(body.success).toBe(true);
      expect(body.status).toBe('ignored');
      expect(applyCollabSnapshot).not.toHaveBeenCalled();
    });

    test('ignores a state event carrying no state', async () => {
      const body = await readBody(await post({ name: 'doc-1', event: 'change' }));

      expect(body.status).toBe('ignored');
      expect(applyCollabSnapshot).not.toHaveBeenCalled();
    });

    test('rejects undecodable state', async () => {
      const response = await post({
        name: 'doc-1',
        event: 'change',
        state: Buffer.from('not a yjs update').toString('base64'),
      });

      expect(responseStatus(response)).toBe(400);
      expect(applyCollabSnapshot).not.toHaveBeenCalled();
    });

    test('rejects a payload with no document name', async () => {
      const response = await post({ event: 'change', state: stateFor('x') });

      expect(responseStatus(response)).toBe(400);
      expect(applyCollabSnapshot).not.toHaveBeenCalled();
    });

    test('rejects a body that is not JSON', async () => {
      const response = await post('this is not json');

      expect(responseStatus(response)).toBe(400);
    });

    test('maps a save event to the periodic revision trigger', async () => {
      await post({
        name: 'doc-1',
        event: 'document.saved',
        state: stateFor('saved'),
      });

      expect(applyCollabSnapshot.mock.calls[0][0].trigger).toBe('periodic');
    });

    test('acknowledges a skipped write without asking for a retry', async () => {
      // A webhook for a document that is not a collaborative draft. Retrying
      // would not change the answer.
      applyCollabSnapshot.mockResolvedValue({
        status: 'skipped',
        reason: 'not-a-collaborative-document',
      });

      const response = await post({
        name: 'doc-1',
        event: 'change',
        state: stateFor('x'),
      });
      const body = await readBody(response);

      expect(responseStatus(response) ?? 200).toBe(200);
      expect(body.status).toBe('skipped');
    });
  });
});
