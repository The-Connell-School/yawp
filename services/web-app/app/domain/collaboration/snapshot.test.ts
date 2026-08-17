import { describe, expect, test } from 'bun:test';
import { prosemirrorToYXmlFragment } from 'y-prosemirror';
import * as Y from 'yjs';
import { Node as PMNode, Schema } from '@tiptap/pm/model';
import { getSchema } from '@tiptap/core';
import { collaborativeSchemaExtensions, COLLAB_FRAGMENT_FIELD } from './schema';
import {
  prosemirrorJsonToSnapshot,
  prosemirrorJsonToText,
  yDocToSnapshot,
  yUpdateToSnapshot,
  type ProsemirrorNode,
} from './snapshot';

/**
 * These tests run against real Yjs documents built through the same
 * ProseMirror binding the browser uses, so they exercise the actual conversion
 * path rather than a stand-in for it.
 */
const schema: Schema = getSchema(collaborativeSchemaExtensions);

/** Builds a Y.Doc whose fragment holds the given ProseMirror JSON. */
function ydocFrom(json: unknown): Y.Doc {
  const ydoc = new Y.Doc();
  const node = PMNode.fromJSON(schema, json as any);
  prosemirrorToYXmlFragment(node, ydoc.getXmlFragment(COLLAB_FRAGMENT_FIELD));
  return ydoc;
}

const paragraph = (text: string): ProsemirrorNode => ({
  type: 'paragraph',
  content: text ? [{ type: 'text', text }] : [],
});

const doc = (...content: ProsemirrorNode[]): ProsemirrorNode => ({
  type: 'doc',
  content,
});

describe('prosemirrorJsonToText', () => {
  test('joins block nodes with newlines', () => {
    expect(
      prosemirrorJsonToText(doc(paragraph('First line.'), paragraph('Second line.')))
    ).toBe('First line.\nSecond line.');
  });

  test('keeps heading text', () => {
    expect(
      prosemirrorJsonToText(
        doc(
          { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Title' }] },
          paragraph('Body.')
        )
      )
    ).toBe('Title\nBody.');
  });

  test('flattens list items onto their own lines', () => {
    expect(
      prosemirrorJsonToText(
        doc({
          type: 'bulletList',
          content: [
            { type: 'listItem', content: [paragraph('one')] },
            { type: 'listItem', content: [paragraph('two')] },
          ],
        })
      )
    ).toContain('one');
  });

  test('renders a hard break as a newline', () => {
    expect(
      prosemirrorJsonToText(
        doc({
          type: 'paragraph',
          content: [
            { type: 'text', text: 'a' },
            { type: 'hardBreak' },
            { type: 'text', text: 'b' },
          ],
        })
      )
    ).toBe('a\nb');
  });

  test('drops trailing empty paragraphs left behind by editing', () => {
    expect(
      prosemirrorJsonToText(doc(paragraph('Only line.'), paragraph(''), paragraph('')))
    ).toBe('Only line.');
  });

  test('does not HTML-escape text, unlike a tag-stripping approach', () => {
    // Going via generated HTML would leave "&amp;" here.
    expect(prosemirrorJsonToText(doc(paragraph('Carter & Angela')))).toBe(
      'Carter & Angela'
    );
  });
});

describe('prosemirrorJsonToSnapshot', () => {
  test('produces HTML the rest of the app can store', () => {
    const { html, text } = prosemirrorJsonToSnapshot(doc(paragraph('The wolves.')));

    expect(html).toContain('<p>The wolves.</p>');
    expect(text).toBe('The wolves.');
  });

  test('preserves marks from the shared schema', () => {
    const { html } = prosemirrorJsonToSnapshot(
      doc({
        type: 'paragraph',
        content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'emphatic' }],
      })
    );

    expect(html).toMatch(/<strong>emphatic<\/strong>/);
  });

  test('preserves a highlight, which is a custom-extended mark', () => {
    // Guards the thing that would break silently if the server used a different
    // extension list than the editor: an unrecognised mark is dropped without
    // any error.
    const { html } = prosemirrorJsonToSnapshot(
      doc({
        type: 'paragraph',
        content: [{ type: 'text', marks: [{ type: 'highlight' }], text: 'noted' }],
      })
    );

    expect(html).toContain('noted');
    expect(html).toMatch(/<mark/);
  });

  test('escapes HTML in student text rather than emitting it raw', () => {
    const { html } = prosemirrorJsonToSnapshot(
      doc(paragraph('<script>alert(1)</script>'))
    );

    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});

describe('yDocToSnapshot', () => {
  test('converts a document written through the ProseMirror binding', () => {
    const ydoc = ydocFrom(doc(paragraph('Written collaboratively.')));

    const { html, text } = yDocToSnapshot(ydoc);

    expect(html).toContain('Written collaboratively.');
    expect(text).toBe('Written collaboratively.');
  });

  test('an untouched room is empty, not an empty paragraph', () => {
    // A fresh group draft must not read as "the students wrote a blank
    // paragraph", because that is indistinguishable from real content downstream.
    expect(yDocToSnapshot(new Y.Doc())).toEqual({ html: '', text: '' });
  });

  test('a document emptied by deleting everything is also empty', () => {
    expect(yDocToSnapshot(ydocFrom(doc(paragraph(''))))).toEqual({
      html: '',
      text: '',
    });
  });

  test('reflects concurrent edits from two clients', () => {
    // The actual collaboration case: two Y.Docs edited independently, then
    // merged. Both contributions have to survive into the snapshot.
    const a = ydocFrom(doc(paragraph('Maya wrote this.')));
    const b = new Y.Doc();
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a));

    // B appends a paragraph while A appends a different one.
    const bFragment = b.getXmlFragment(COLLAB_FRAGMENT_FIELD);
    const bPara = new Y.XmlElement('paragraph');
    bPara.insert(0, [new Y.XmlText('Devon added this.')]);
    bFragment.insert(bFragment.length, [bPara]);

    const aFragment = a.getXmlFragment(COLLAB_FRAGMENT_FIELD);
    const aPara = new Y.XmlElement('paragraph');
    aPara.insert(0, [new Y.XmlText('Amara added this.')]);
    aFragment.insert(aFragment.length, [aPara]);

    // Converge.
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b));
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a));

    const fromA = yDocToSnapshot(a);
    const fromB = yDocToSnapshot(b);

    expect(fromA.text).toContain('Maya wrote this.');
    expect(fromA.text).toContain('Devon added this.');
    expect(fromA.text).toContain('Amara added this.');
    // Both replicas must derive the identical snapshot, or two webhook
    // deliveries would write different HTML for the same document.
    expect(fromA).toEqual(fromB);
  });
});

describe('yUpdateToSnapshot', () => {
  test('reconstructs a document from an encoded state update', () => {
    const source = ydocFrom(doc(paragraph('From an update.')));
    const update = Y.encodeStateAsUpdate(source);

    expect(yUpdateToSnapshot(update).text).toBe('From an update.');
  });

  test('is idempotent: applying the same update twice is identical', () => {
    // Yjs updates are commutative and idempotent, which is what makes a
    // redelivered webhook safe.
    const source = ydocFrom(doc(paragraph('Delivered twice.')));
    const update = Y.encodeStateAsUpdate(source);

    const once = yUpdateToSnapshot(update);

    const ydoc = new Y.Doc();
    Y.applyUpdate(ydoc, update);
    Y.applyUpdate(ydoc, update);
    const twice = yDocToSnapshot(ydoc);

    expect(twice).toEqual(once);
  });

  test('order of merged updates does not change the result', () => {
    const a = ydocFrom(doc(paragraph('alpha')));
    const b = ydocFrom(doc(paragraph('beta')));
    const updateA = Y.encodeStateAsUpdate(a);
    const updateB = Y.encodeStateAsUpdate(b);

    const forward = new Y.Doc();
    Y.applyUpdate(forward, updateA);
    Y.applyUpdate(forward, updateB);

    const backward = new Y.Doc();
    Y.applyUpdate(backward, updateB);
    Y.applyUpdate(backward, updateA);

    expect(yDocToSnapshot(forward)).toEqual(yDocToSnapshot(backward));
  });

  test('an empty update yields the empty snapshot', () => {
    expect(yUpdateToSnapshot(Y.encodeStateAsUpdate(new Y.Doc()))).toEqual({
      html: '',
      text: '',
    });
  });
});
