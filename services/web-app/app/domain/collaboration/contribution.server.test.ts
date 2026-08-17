import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import * as Y from 'yjs';
import { COLLAB_FRAGMENT_FIELD } from './schema';

const readRoomState = mock();
const readDocumentAuthorship = mock();

const actualRoomStore = globalThis.__realModules[
  '~/domain/collaboration/room-store.server'
];
const actualAuthorship = globalThis.__realModules[
  '~/domain/collaboration/authorship.server'
];

mock.module('~/domain/collaboration/room-store.server', () => ({
  ...actualRoomStore,
  readRoomState,
}));
mock.module('~/domain/collaboration/authorship.server', () => ({
  ...actualAuthorship,
  readDocumentAuthorship,
}));

const { buildContributionBreakdown } = await import('./contribution.server');

afterAll(() => {
  mock.restore();
  mock.module(
    '~/domain/collaboration/room-store.server',
    () => actualRoomStore
  );
  mock.module('~/domain/collaboration/authorship.server', () => actualAuthorship);
});

const MAYA = 'member-maya';
const DEVON = 'member-devon';

function twoWriterDoc() {
  const maya = new Y.Doc();
  const fragment = maya.getXmlFragment(COLLAB_FRAGMENT_FIELD);
  const paragraph = new Y.XmlElement('paragraph');
  fragment.insert(0, [paragraph]);
  paragraph.insert(0, [new Y.XmlText('Maya wrote ten.')]);

  const devon = new Y.Doc();
  Y.applyUpdate(devon, Y.encodeStateAsUpdate(maya));
  const text = (devon.getXmlFragment(COLLAB_FRAGMENT_FIELD).get(0) as any).get(0);
  text.insert(text.length, ' Devon five.');

  return {
    maya,
    devon,
    state: Y.mergeUpdates([
      Y.encodeStateAsUpdate(maya),
      Y.encodeStateAsUpdate(devon),
    ]),
  };
}

const roster = [
  { membershipId: MAYA, name: 'Maya P.' },
  { membershipId: DEVON, name: 'Devon K.' },
];

describe('buildContributionBreakdown', () => {
  let docs: ReturnType<typeof twoWriterDoc>;

  beforeEach(() => {
    docs = twoWriterDoc();
    readRoomState.mockReset().mockResolvedValue(docs.state);
    readDocumentAuthorship.mockReset().mockResolvedValue({
      ownerOfClient: new Map([
        [String(docs.maya.clientID), MAYA],
        [String(docs.devon.clientID), DEVON],
      ]),
      byMember: [
        {
          membershipId: MAYA,
          charsInserted: 15,
          charsDeleted: 0,
          updateCount: 6,
          sessionCount: 2,
          firstSeenAt: new Date('2026-08-17T09:00:00Z'),
          lastSeenAt: new Date('2026-08-18T10:00:00Z'),
        },
        {
          membershipId: DEVON,
          charsInserted: 12,
          charsDeleted: 40,
          updateCount: 3,
          sessionCount: 1,
          firstSeenAt: new Date('2026-08-18T21:00:00Z'),
          lastSeenAt: new Date('2026-08-18T21:10:00Z'),
        },
      ],
    });
  });

  const build = () =>
    buildContributionBreakdown({ documentId: 'doc-1', roster });

  test('reports every student on the roster, including one who never wrote', () => {
    // A student with no contribution is the single most important row on the
    // page. Omitting them would hide exactly what the teacher is looking for.
    readDocumentAuthorship.mockResolvedValue({
      ownerOfClient: new Map([[String(docs.maya.clientID), MAYA]]),
      byMember: [
        {
          membershipId: MAYA,
          charsInserted: 15,
          charsDeleted: 0,
          updateCount: 6,
          sessionCount: 1,
          firstSeenAt: new Date('2026-08-17T09:00:00Z'),
          lastSeenAt: new Date('2026-08-17T09:30:00Z'),
        },
      ],
    });

    return build().then((result) => {
      expect(result.members.map((m) => m.membershipId)).toEqual([MAYA, DEVON]);
      const devon = result.members.find((m) => m.membershipId === DEVON);
      expect(devon).toMatchObject({
        name: 'Devon K.',
        survivingChars: 0,
        charsInserted: 0,
        sessionCount: 0,
        hasWritten: false,
      });
    });
  });

  test('counts surviving characters from the document, not from the log', () => {
    // charsInserted is what they typed; survivingChars is what is still there.
    // Showing only the former rewards writing and deleting.
    return build().then((result) => {
      const maya = result.members.find((m) => m.membershipId === MAYA);
      expect(maya?.survivingChars).toBe(15);
      expect(maya?.charsInserted).toBe(15);
    });
  });

  test('carries deletions through so a reviser is visible', () => {
    return build().then((result) => {
      const devon = result.members.find((m) => m.membershipId === DEVON);
      expect(devon?.charsDeleted).toBe(40);
    });
  });

  test('reports sessions and when each student worked', () => {
    return build().then((result) => {
      const maya = result.members.find((m) => m.membershipId === MAYA);
      expect(maya?.sessionCount).toBe(2);
      expect(maya?.firstSeenAt).toBe('2026-08-17T09:00:00.000Z');
      expect(maya?.lastSeenAt).toBe('2026-08-18T10:00:00.000Z');
    });
  });

  test('gives the draft back as attributed paragraphs', () => {
    return build().then((result) => {
      expect(result.paragraphs).toEqual([
        [
          { membershipId: MAYA, text: 'Maya wrote ten.' },
          { membershipId: DEVON, text: ' Devon five.' },
        ],
      ]);
    });
  });

  test('reports each student’s share of the draft’s current characters', async () => {
    // Asked for explicitly. It is a proportion of text, which is not the same as
    // a proportion of the work — the panel says so, and nothing computes a grade
    // from it.
    const result = await build();

    const maya = result.members.find((m) => m.membershipId === MAYA);
    const devon = result.members.find((m) => m.membershipId === DEVON);
    // 15 and 12 surviving characters out of 27.
    expect(result.totalChars).toBe(27);
    expect(maya?.survivingShare).toBe(56);
    expect(devon?.survivingShare).toBe(44);
  });

  test('a student who wrote nothing has a zero share, not a missing one', async () => {
    readDocumentAuthorship.mockResolvedValue({
      ownerOfClient: new Map([[String(docs.maya.clientID), MAYA]]),
      byMember: [
        {
          membershipId: MAYA,
          charsInserted: 15,
          charsDeleted: 0,
          updateCount: 6,
          sessionCount: 1,
          firstSeenAt: new Date('2026-08-17T09:00:00Z'),
          lastSeenAt: new Date('2026-08-17T09:30:00Z'),
        },
      ],
    });

    const result = await build();

    expect(
      result.members.find((m) => m.membershipId === DEVON)?.survivingShare
    ).toBe(0);
  });

  test('shares are of the whole draft, including unattributed text', async () => {
    // Otherwise a draft that is half unattributed would report shares summing to
    // 100% and quietly overstate what is actually known.
    readDocumentAuthorship.mockResolvedValue({
      ownerOfClient: new Map([[String(docs.maya.clientID), MAYA]]),
      byMember: [
        {
          membershipId: MAYA,
          charsInserted: 15,
          charsDeleted: 0,
          updateCount: 1,
          sessionCount: 1,
          firstSeenAt: new Date('2026-08-17T09:00:00Z'),
          lastSeenAt: new Date('2026-08-17T09:30:00Z'),
        },
      ],
    });

    const result = await build();

    expect(result.unattributedChars).toBe(12);
    expect(
      result.members.find((m) => m.membershipId === MAYA)?.survivingShare
    ).toBe(56);
  });

  test('an empty draft reports zero shares rather than dividing by zero', async () => {
    readRoomState.mockResolvedValue(null);
    readDocumentAuthorship.mockResolvedValue({
      ownerOfClient: new Map(),
      byMember: [],
    });

    const result = await build();

    expect(result.totalChars).toBe(0);
    expect(result.members.every((m) => m.survivingShare === 0)).toBe(true);
  });

  test('an empty room reports the roster with nothing written', async () => {
    readRoomState.mockResolvedValue(null);
    readDocumentAuthorship.mockResolvedValue({
      ownerOfClient: new Map(),
      byMember: [],
    });

    const result = await build();

    expect(result.paragraphs).toEqual([]);
    expect(result.members.every((m) => !m.hasWritten)).toBe(true);
  });

  test('text by an unrecorded client is surfaced, not silently dropped', async () => {
    // Drafts written before authorship was recorded still have text in them. A
    // teacher should see that some of it is unattributed rather than see a
    // document that quietly disagrees with the totals.
    readDocumentAuthorship.mockResolvedValue({
      ownerOfClient: new Map(),
      byMember: [],
    });

    const result = await build();

    expect(result.unattributedChars).toBeGreaterThan(0);
  });
});
