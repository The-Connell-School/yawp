import { describe, expect, test } from 'bun:test';
import * as Y from 'yjs';
import { COLLAB_FRAGMENT_FIELD } from './schema';
import { decideSeed, htmlToYUpdate, isRoomEmpty } from './seed';
import { yUpdateToSnapshot } from './snapshot';

/**
 * The strongest available check on seeding: encode HTML into Yjs state, then run
 * it back through the dual-write's own conversion. If the two agree, a seeded
 * room and the snapshot grading reads are the same document.
 */
const roundTrip = (html: string) => {
  const update = htmlToYUpdate(html);
  if (!update) return null;
  return yUpdateToSnapshot(update);
};

describe('htmlToYUpdate', () => {
  test('encodes a paragraph the snapshot converter reads back identically', () => {
    const result = roundTrip('<p>The wolves are never only wolves.</p>');

    expect(result?.text).toBe('The wolves are never only wolves.');
    expect(result?.html).toContain('<p>The wolves are never only wolves.</p>');
  });

  test('round-trips multiple blocks in order', () => {
    const result = roundTrip('<p>First.</p><p>Second.</p><p>Third.</p>');

    expect(result?.text).toBe('First.\nSecond.\nThird.');
  });

  test('round-trips headings and lists', () => {
    const result = roundTrip(
      '<h2>Title</h2><p>Body.</p><ul><li><p>one</p></li><li><p>two</p></li></ul>'
    );

    expect(result?.text).toContain('Title');
    expect(result?.text).toContain('Body.');
    expect(result?.text).toContain('one');
    expect(result?.html).toMatch(/<h2>/);
    expect(result?.html).toMatch(/<ul>/);
  });

  test('round-trips marks', () => {
    const result = roundTrip('<p><strong>bold</strong> and <em>italic</em></p>');

    expect(result?.html).toMatch(/<strong>bold<\/strong>/);
    expect(result?.html).toMatch(/<em>italic<\/em>/);
  });

  test('preserves an ampersand through both conversions', () => {
    // The failure mode this guards: HTML-escaping applied twice, so the student's
    // "Carter & Angela" comes back as "Carter &amp;amp; Angela".
    const result = roundTrip('<p>Carter &amp; Angela</p>');

    expect(result?.text).toBe('Carter & Angela');
    expect(result?.html).not.toContain('&amp;amp;');
  });

  test('returns null for empty html rather than an empty update', () => {
    // An empty update would still mark the room seeded, blocking a later real
    // seed for no benefit.
    expect(htmlToYUpdate('')).toBeNull();
    expect(htmlToYUpdate('   ')).toBeNull();
  });

  test('returns null for html that parses to no content', () => {
    expect(htmlToYUpdate('<p></p>')).toBeNull();
  });

  test('produces state that applies cleanly to a fresh document', () => {
    const update = htmlToYUpdate('<p>Applied.</p>');
    const ydoc = new Y.Doc();

    expect(() => Y.applyUpdate(ydoc, update!)).not.toThrow();
    expect(ydoc.getXmlFragment(COLLAB_FRAGMENT_FIELD).length).toBeGreaterThan(0);
  });

  test('seeding twice would duplicate content, which is why it must not happen', () => {
    // Not a guard test — a demonstration of the hazard the guards exist for.
    // Applying the same seed to two different docs and merging them is what a
    // client-side seed does across participants.
    const update = htmlToYUpdate('<p>Once.</p>')!;

    const a = new Y.Doc();
    Y.applyUpdate(a, update);
    const b = new Y.Doc();
    Y.applyUpdate(b, htmlToYUpdate('<p>Once.</p>')!);

    Y.applyUpdate(a, Y.encodeStateAsUpdate(b));

    const occurrences = yUpdateToSnapshot(Y.encodeStateAsUpdate(a)).text.split(
      'Once.'
    ).length - 1;
    expect(occurrences).toBe(2);
  });
});

describe('isRoomEmpty', () => {
  test('an absent or zero-length state is empty', () => {
    expect(isRoomEmpty(null)).toBe(true);
    expect(isRoomEmpty(undefined)).toBe(true);
    expect(isRoomEmpty(new Uint8Array())).toBe(true);
  });

  test('a fresh document is empty', () => {
    expect(isRoomEmpty(Y.encodeStateAsUpdate(new Y.Doc()))).toBe(true);
  });

  test('a document with content is not empty', () => {
    expect(isRoomEmpty(htmlToYUpdate('<p>Something.</p>')!)).toBe(false);
  });

  test('undecodable state is not treated as empty', () => {
    // Fail closed: refusing to seed is recoverable, duplicating an essay is not.
    expect(isRoomEmpty(new Uint8Array([1, 2, 3, 4, 5]))).toBe(false);
  });
});

describe('decideSeed', () => {
  const html = '<p>Existing work.</p>';

  test('seeds an empty room from a document with content', () => {
    const decision = decideSeed({ html, seededAt: null, roomState: null });

    expect(decision.seed).toBe(true);
    expect(decision.seed && yUpdateToSnapshot(decision.update).text).toBe(
      'Existing work.'
    );
  });

  test('refuses when the group is already marked seeded', () => {
    expect(
      decideSeed({ html, seededAt: new Date('2026-08-17'), roomState: null })
    ).toEqual({ seed: false, reason: 'already-seeded' });
  });

  test('refuses when the room already has content', () => {
    // A student got there first. Seeding now would duplicate their opening
    // paragraph underneath what they typed.
    expect(
      decideSeed({
        html,
        seededAt: null,
        roomState: htmlToYUpdate('<p>Student typed first.</p>'),
      })
    ).toEqual({ seed: false, reason: 'room-not-empty' });
  });

  test('refuses when the document has nothing to seed', () => {
    expect(decideSeed({ html: '', seededAt: null, roomState: null })).toEqual({
      seed: false,
      reason: 'nothing-to-seed',
    });
    expect(decideSeed({ html: null, seededAt: null, roomState: null })).toEqual({
      seed: false,
      reason: 'nothing-to-seed',
    });
  });

  test('checks both guards, not just the durable one', () => {
    // seededAt is our record; room emptiness is the provider's truth. Either
    // alone is insufficient, so both are asserted here.
    expect(
      decideSeed({
        html,
        seededAt: new Date('2026-08-17'),
        roomState: htmlToYUpdate('<p>Content.</p>'),
      }).seed
    ).toBe(false);
  });
});
