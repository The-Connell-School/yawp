import { describe, expect, test } from 'bun:test';
import * as Y from 'yjs';
import { readUpdateAttribution } from './attribution';

/** One client's incremental update, the way the provider actually sends them. */
function captureUpdate(doc: Y.Doc, mutate: () => void): Uint8Array {
  let captured: Uint8Array | null = null;
  const handler = (update: Uint8Array) => {
    captured = update;
  };
  doc.on('update', handler);
  mutate();
  doc.off('update', handler);
  if (!captured) throw new Error('no update produced');
  return captured;
}

describe('readUpdateAttribution', () => {
  test('reports the client that produced an insert, and how much', () => {
    const doc = new Y.Doc();
    const update = captureUpdate(doc, () =>
      doc.getText('t').insert(0, 'hello')
    );

    const result = readUpdateAttribution(update);

    expect(result.clientIds).toEqual([String(doc.clientID)]);
    expect(result.charsInserted).toBe(5);
    expect(result.charsDeleted).toBe(0);
  });

  test('reports a deletion, and whose text was removed', () => {
    // The reviser case: knowing who cut whose text is what keeps a student who
    // tightens someone else's paragraph from reading as a freeloader.
    const author = new Y.Doc();
    author.getText('t').insert(0, 'hello world');

    const editor = new Y.Doc();
    Y.applyUpdate(editor, Y.encodeStateAsUpdate(author));
    const update = captureUpdate(editor, () => editor.getText('t').delete(0, 6));

    const result = readUpdateAttribution(update);

    expect(result.charsDeleted).toBe(6);
    expect(result.charsInserted).toBe(0);
    // The delete set names whose content went, which is not the same person as
    // the one doing the deleting.
    expect(result.deletedFromClientIds).toEqual([String(author.clientID)]);
  });

  test('client ids are strings, because they overflow a 32-bit int column', () => {
    // Yjs client ids are uint32, so values above 2147483647 are ordinary and
    // would overflow Postgres Int.
    const doc = new Y.Doc();
    const update = captureUpdate(doc, () => doc.getText('t').insert(0, 'x'));

    for (const id of readUpdateAttribution(update).clientIds) {
      expect(typeof id).toBe('string');
      expect(Number(id)).toBeGreaterThan(0);
    }
  });

  test('a merged update names every client in it', () => {
    // Compaction merges many authors into one payload. Reading it must still
    // reveal all of them, or a compacted room loses everyone but the first.
    const a = new Y.Doc();
    a.getText('t').insert(0, 'from A ');
    const ua = Y.encodeStateAsUpdate(a);

    const b = new Y.Doc();
    Y.applyUpdate(b, ua);
    const ub = captureUpdate(b, () =>
      b.getText('t').insert(b.getText('t').length, 'from B')
    );

    const merged = Y.mergeUpdates([ua, ub]);
    const result = readUpdateAttribution(merged);

    expect(result.clientIds.sort()).toEqual(
      [String(a.clientID), String(b.clientID)].sort()
    );
  });

  test('malformed bytes are reported as nothing rather than thrown', () => {
    // This runs on the write path. A payload that cannot be decoded must not
    // take down the request that carries a student's edit.
    const result = readUpdateAttribution(new Uint8Array([1, 2, 3, 4, 5]));

    expect(result.clientIds).toEqual([]);
    expect(result.charsInserted).toBe(0);
  });

  test('an empty update names nobody', () => {
    const doc = new Y.Doc();
    const update = Y.encodeStateAsUpdate(doc);

    expect(readUpdateAttribution(update).clientIds).toEqual([]);
  });
});
