import { describe, expect, test } from 'bun:test';
import * as Y from 'yjs';
import { COLLAB_FRAGMENT_FIELD } from './schema';
import { attributedParagraphs, survivingCharsByMember } from './contribution';

/** Builds a two-paragraph doc in the shape TipTap Collaboration actually uses. */
function docWith(paragraphs: string[]): Y.Doc {
  const doc = new Y.Doc();
  const fragment = doc.getXmlFragment(COLLAB_FRAGMENT_FIELD);
  paragraphs.forEach((text, index) => {
    const element = new Y.XmlElement('paragraph');
    fragment.insert(index, [element]);
    element.insert(0, [new Y.XmlText(text)]);
  });
  return doc;
}

const stateOf = (doc: Y.Doc) => Y.encodeStateAsUpdate(doc);

describe('attributedParagraphs', () => {
  test('attributes each run of text to the member who wrote it', () => {
    const maya = docWith(['Maya opened. ']);
    const devon = new Y.Doc();
    Y.applyUpdate(devon, stateOf(maya));
    const text = (devon.getXmlFragment(COLLAB_FRAGMENT_FIELD).get(0) as any).get(0);
    text.insert(text.length, 'Devon continued.');

    const owners = new Map([
      [String(maya.clientID), 'member-maya'],
      [String(devon.clientID), 'member-devon'],
    ]);

    const paragraphs = attributedParagraphs({
      update: Y.mergeUpdates([stateOf(maya), stateOf(devon)]),
      ownerOfClient: owners,
    });

    expect(paragraphs).toEqual([
      [
        { membershipId: 'member-maya', text: 'Maya opened. ' },
        { membershipId: 'member-devon', text: 'Devon continued.' },
      ],
    ]);
  });

  test('keeps paragraphs separate, in reading order', () => {
    // The teacher is looking at the draft, so it has to read as the draft.
    const doc = docWith(['First para. ', 'Second para.']);
    const owners = new Map([[String(doc.clientID), 'member-1']]);

    const paragraphs = attributedParagraphs({
      update: stateOf(doc),
      ownerOfClient: owners,
    });

    expect(paragraphs).toHaveLength(2);
    expect(paragraphs[0][0].text).toBe('First para. ');
    expect(paragraphs[1][0].text).toBe('Second para.');
  });

  test('merges adjacent runs from the same person', () => {
    // Yjs splits items on every insertion point, so one sentence typed normally
    // is many items. Rendering a span per item would be unreadable.
    const doc = docWith(['abc']);
    const text = (doc.getXmlFragment(COLLAB_FRAGMENT_FIELD).get(0) as any).get(0);
    text.insert(3, 'def');
    text.insert(6, 'ghi');
    const owners = new Map([[String(doc.clientID), 'member-1']]);

    const paragraphs = attributedParagraphs({
      update: stateOf(doc),
      ownerOfClient: owners,
    });

    expect(paragraphs[0]).toEqual([
      { membershipId: 'member-1', text: 'abcdefghi' },
    ]);
  });

  test('omits deleted text, because the draft no longer contains it', () => {
    const doc = docWith(['keep this cut this']);
    const text = (doc.getXmlFragment(COLLAB_FRAGMENT_FIELD).get(0) as any).get(0);
    text.delete(10, 8);
    const owners = new Map([[String(doc.clientID), 'member-1']]);

    const paragraphs = attributedParagraphs({
      update: stateOf(doc),
      ownerOfClient: owners,
    });

    expect(paragraphs[0][0].text).toBe('keep this ');
  });

  test('an unknown client is reported as unattributed rather than guessed', () => {
    // Happens for text written before authorship was recorded. Saying "we do not
    // know" is honest; assigning it to whoever is handy is not.
    const doc = docWith(['mystery text']);

    const paragraphs = attributedParagraphs({
      update: stateOf(doc),
      ownerOfClient: new Map(),
    });

    expect(paragraphs[0]).toEqual([
      { membershipId: null, text: 'mystery text' },
    ]);
  });

  test('an empty document yields no paragraphs', () => {
    expect(
      attributedParagraphs({
        update: stateOf(new Y.Doc()),
        ownerOfClient: new Map(),
      })
    ).toEqual([]);
  });

  test('undecodable state yields nothing rather than throwing', () => {
    expect(
      attributedParagraphs({
        update: new Uint8Array([7, 7, 7]),
        ownerOfClient: new Map(),
      })
    ).toEqual([]);
  });
});

describe('survivingCharsByMember', () => {
  test('counts only text still in the draft', () => {
    // The headline number has to describe the document as it stands, or a
    // student who wrote and then cut 500 words looks like the biggest
    // contributor.
    const doc = docWith(['keep this cut this']);
    const text = (doc.getXmlFragment(COLLAB_FRAGMENT_FIELD).get(0) as any).get(0);
    text.delete(10, 8);

    const counts = survivingCharsByMember({
      update: stateOf(doc),
      ownerOfClient: new Map([[String(doc.clientID), 'member-1']]),
    });

    expect(counts.get('member-1')).toBe(10);
  });

  test('splits the total between two writers', () => {
    const maya = docWith(['12345']);
    const devon = new Y.Doc();
    Y.applyUpdate(devon, stateOf(maya));
    const text = (devon.getXmlFragment(COLLAB_FRAGMENT_FIELD).get(0) as any).get(0);
    text.insert(text.length, '123');

    const counts = survivingCharsByMember({
      update: Y.mergeUpdates([stateOf(maya), stateOf(devon)]),
      ownerOfClient: new Map([
        [String(maya.clientID), 'member-maya'],
        [String(devon.clientID), 'member-devon'],
      ]),
    });

    expect(counts.get('member-maya')).toBe(5);
    expect(counts.get('member-devon')).toBe(3);
  });
});
