import { describe, expect, test } from 'bun:test';
import * as Y from 'yjs';
import {
  buildCollabRoom,
  cohortEmail,
  GBA300_COHORT,
  GBA300_GROUP_PLANS,
} from './local-dev/collab-demo-plan';
import { COLLAB_FRAGMENT_FIELD } from '../../../services/web-app/app/domain/collaboration/fragment';
import { yDocToSnapshot } from '../../../services/web-app/app/domain/collaboration/snapshot';

/**
 * The demo rooms are the one part of this seed that can be wrong without looking
 * wrong. A malformed room opens as a blank page, and the first keystroke
 * dual-writes that blankness over the HTML the seed wrote — so the failure shows
 * up as "the demo data disappeared", long after the seed ran.
 */
function replayRoom(updates: { update: Uint8Array }[]) {
  const doc = new Y.Doc();
  for (const row of updates) Y.applyUpdate(doc, row.update);
  return doc;
}

describe('buildCollabRoom', () => {
  const contributions = [
    { author: 'ada', paragraphs: ['Ada opens.', 'Ada continues.'] },
    { author: 'ben', paragraphs: ['Ben adds a middle.'] },
    { author: 'cy', paragraphs: ['Cy closes.'] },
  ];

  test('replaying the log reproduces the snapshot the seed stores', async () => {
    // Two invariants at once. `Document.html` has to be what the room actually
    // contains, or grading reads one document while the students see another —
    // and the seed builds that HTML itself rather than calling the converter,
    // because the converter drags TipTap into a workspace that does not have it.
    // This is what stops the shortcut drifting from the real thing.
    const room = buildCollabRoom(contributions);

    const replayed = yDocToSnapshot(replayRoom(room.updates));

    expect(replayed.html).toBe(room.html);
    expect(replayed.text).toBe(room.text);
  });

  test('every seeded room’s HTML is what the converter would produce', () => {
    // The same check across the demo's real content, not just the fixture above:
    // an apostrophe or an ampersand the converter escapes and the seed does not
    // would put two different documents in front of the teacher and the group.
    for (const plan of GBA300_GROUP_PLANS) {
      const room = buildCollabRoom(plan.contributions);
      const replayed = yDocToSnapshot(replayRoom(room.updates));
      expect(replayed.html).toBe(room.html);
      expect(replayed.text).toBe(room.text);
    }
  });

  test('keeps every member’s paragraphs, in the order they were added', () => {
    const room = buildCollabRoom(contributions);

    expect(room.html).toBe(
      '<p>Ada opens.</p><p>Ada continues.</p><p>Ben adds a middle.</p><p>Cy closes.</p>'
    );
  });

  test('gives each member their own Yjs client id', () => {
    // One client id for the whole document would make the contribution
    // breakdown say a single anonymous author wrote all of it.
    const room = buildCollabRoom(contributions);

    const clientIds = room.authors.map((author) => author.clientId);
    expect(new Set(clientIds).size).toBe(3);
    expect(clientIds.every((id) => /^\d+$/.test(id))).toBe(true);
  });

  test('applying the log out of order converges on the same document', () => {
    // Not a curiosity: the polling transport delivers updates whenever it
    // manages to, so a room that only reads correctly in log order would be
    // broken for the second student to load the page.
    const room = buildCollabRoom(contributions);

    const forward = replayRoom(room.updates);
    const backward = replayRoom([...room.updates].reverse());

    expect(yDocToSnapshot(backward).html).toBe(yDocToSnapshot(forward).html);
  });

  test('applying the log twice changes nothing', () => {
    const room = buildCollabRoom(contributions);

    const doubled = replayRoom([...room.updates, ...room.updates]);

    expect(yDocToSnapshot(doubled).html).toBe(room.html);
  });

  test('counts the characters each member put in', () => {
    const room = buildCollabRoom(contributions);

    const ada = room.authors.find((author) => author.author === 'ada');
    expect(ada?.charsInserted).toBe(
      'Ada opens.'.length + 'Ada continues.'.length
    );
    expect(ada?.updateCount).toBe(2);
  });

  test('a member who has written nothing produces no row at all', () => {
    // Not a zero-length update: an empty row would claim a client id that no
    // item in the document carries.
    const room = buildCollabRoom([
      { author: 'ada', paragraphs: ['Something.'] },
      { author: 'ben', paragraphs: [] },
    ]);

    expect(room.updates).toHaveLength(1);
    expect(room.authors.map((author) => author.author)).toEqual(['ada']);
  });

  test('an empty room is an empty snapshot rather than a crash', () => {
    const room = buildCollabRoom([]);

    expect(room.updates).toEqual([]);
    expect(room.text).toBe('');
  });

  test('the fragment field matches the one the editor binds to', () => {
    // A room written to a different field is invisible to the editor while
    // looking perfectly healthy in the database.
    const room = buildCollabRoom(contributions);

    const doc = replayRoom(room.updates);
    expect(doc.getXmlFragment(COLLAB_FRAGMENT_FIELD).length).toBe(4);
  });
});

describe('buildCollabRoom, revising an earlier paragraph', () => {
  const original = 'Ben wrote this sentence, though it runs a little long.';

  test('the reviser gets credit for the deletion, not the original author', () => {
    const room = buildCollabRoom([
      { author: 'ben', paragraphs: [original] },
      {
        author: 'cy',
        paragraphs: [],
        revise: {
          paragraph: original,
          removeSubstring: ', though it runs a little long',
        },
      },
    ]);

    const ben = room.authors.find((a) => a.author === 'ben');
    const cy = room.authors.find((a) => a.author === 'cy');
    expect(ben?.charsDeleted).toBe(0);
    expect(cy?.charsDeleted).toBe(', though it runs a little long'.length);
  });

  test('a reviser who only deletes types nothing new', () => {
    const room = buildCollabRoom([
      { author: 'ben', paragraphs: [original] },
      {
        author: 'cy',
        paragraphs: [],
        revise: {
          paragraph: original,
          removeSubstring: ', though it runs a little long',
        },
      },
    ]);

    const cy = room.authors.find((a) => a.author === 'cy');
    expect(cy?.charsInserted).toBe(0);
  });

  test('a reviser who replaces text is credited for what they typed', () => {
    const room = buildCollabRoom([
      { author: 'ben', paragraphs: [original] },
      {
        author: 'cy',
        paragraphs: [],
        revise: {
          paragraph: original,
          removeSubstring: 'runs a little long',
          insertText: 'is too long',
        },
      },
    ]);

    const cy = room.authors.find((a) => a.author === 'cy');
    expect(cy?.charsInserted).toBe('is too long'.length);
    expect(room.text).toBe('Ben wrote this sentence, though it is too long.');
  });

  test('the surviving document and the stored snapshot still match', () => {
    // The invariant the whole shortcut depends on, now under a delete as well
    // as an insert.
    const room = buildCollabRoom([
      { author: 'ben', paragraphs: [original] },
      {
        author: 'cy',
        paragraphs: [],
        revise: {
          paragraph: original,
          removeSubstring: 'runs a little long',
          insertText: 'is too long',
        },
      },
    ]);

    const replayed = yDocToSnapshot(replayRoom(room.updates));
    expect(replayed.html).toBe(room.html);
    expect(replayed.text).toBe(room.text);
  });

  test('deleted text is attributed away from its original author on replay', () => {
    // Attribution is per surviving Yjs item, so this is really testing that the
    // delete reached the real document and not just the seed's own bookkeeping.
    const room = buildCollabRoom([
      { author: 'ben', paragraphs: [original] },
      {
        author: 'cy',
        paragraphs: [],
        revise: {
          paragraph: original,
          removeSubstring: ', though it runs a little long',
        },
      },
    ]);

    const doc = replayRoom(room.updates);
    const text = doc
      .getXmlFragment(COLLAB_FRAGMENT_FIELD)
      .toArray()[0]
      .toArray()[0];
    expect(String(text)).toBe('Ben wrote this sentence.');
  });

  test('a revise-only contribution produces exactly one update, not a blank append', () => {
    const room = buildCollabRoom([
      { author: 'ben', paragraphs: [original] },
      {
        author: 'cy',
        paragraphs: [],
        revise: {
          paragraph: original,
          removeSubstring: ', though it runs a little long',
        },
      },
    ]);

    expect(room.updates).toHaveLength(2);
    expect(room.updates[1].author).toBe('cy');
  });

  test('a target paragraph that does not exist fails loudly', () => {
    // A copy edit to the original paragraph, or a typo in the plan, must not
    // silently revise nothing — it has to be caught before it reaches a demo.
    expect(() =>
      buildCollabRoom([
        { author: 'ben', paragraphs: [original] },
        {
          author: 'cy',
          paragraphs: [],
          revise: {
            paragraph: 'Not a paragraph that exists.',
            removeSubstring: 'x',
          },
        },
      ])
    ).toThrow(/Revise target not found/);
  });

  test('a substring that is not actually in the target paragraph fails loudly', () => {
    expect(() =>
      buildCollabRoom([
        { author: 'ben', paragraphs: [original] },
        {
          author: 'cy',
          paragraphs: [],
          revise: {
            paragraph: original,
            removeSubstring: 'nonexistent phrase',
          },
        },
      ])
    ).toThrow(/Revise substring/);
  });

  test('a contribution may both revise an earlier line and add its own', () => {
    const room = buildCollabRoom([
      { author: 'ben', paragraphs: [original] },
      {
        author: 'cy',
        paragraphs: ["Cy's own new sentence."],
        revise: {
          paragraph: original,
          removeSubstring: ', though it runs a little long',
        },
      },
    ]);

    const cy = room.authors.find((a) => a.author === 'cy');
    // One session, two things done in it: the revise and the new paragraph.
    expect(cy?.updateCount).toBe(2);
    expect(cy?.charsDeleted).toBe(', though it runs a little long'.length);
    expect(cy?.charsInserted).toBe("Cy's own new sentence.".length);
    expect(room.text).toBe("Ben wrote this sentence.\nCy's own new sentence.");
  });
});

describe('the GBA 300 demo plan', () => {
  const authorKeys = new Set<string>([
    ...GBA300_COHORT.map((student) => student.key),
    'student',
    'student-submitted',
    'student-graded',
    'student-unreleased',
  ]);

  test('every contributor is someone in the group, present or removed', () => {
    // A paragraph attributed to a non-member would seed an authorship row the
    // contribution breakdown cannot resolve to a name. `removedMember` is the
    // one deliberate exception: a former member's writing is still theirs.
    for (const plan of GBA300_GROUP_PLANS) {
      const known = plan.removedMember
        ? [...plan.members, plan.removedMember]
        : plan.members;
      for (const contribution of plan.contributions) {
        expect(known).toContain(contribution.author);
      }
    }
  });

  test('a removed member is not also a current one', () => {
    // Being in both would make "absent from the roster, present in the draft"
    // meaningless — the whole point of the scenario.
    for (const plan of GBA300_GROUP_PLANS) {
      if (!plan.removedMember) continue;
      expect(plan.members).not.toContain(plan.removedMember);
    }
  });

  test('every member is a student the seed knows how to create', () => {
    for (const plan of GBA300_GROUP_PLANS) {
      for (const member of plan.members) {
        expect(authorKeys.has(member)).toBe(true);
      }
      if (plan.removedMember)
        expect(authorKeys.has(plan.removedMember)).toBe(true);
    }
  });

  test('nobody is in two groups at once', () => {
    const seen = new Set<string>();
    for (const plan of GBA300_GROUP_PLANS) {
      for (const member of plan.members) {
        expect(seen.has(member)).toBe(false);
        seen.add(member);
      }
    }
  });

  test('group ordinals are distinct, which the unique index requires', () => {
    const ordinals = GBA300_GROUP_PLANS.map((plan) => plan.ordinal);
    expect(new Set(ordinals).size).toBe(ordinals.length);
  });

  test('only a graded group carries a grade', () => {
    for (const plan of GBA300_GROUP_PLANS) {
      expect(Boolean(plan.grade)).toBe(plan.stage === 'graded');
    }
  });

  test('a graded group has the free-text score the group grade is read from', () => {
    // `readGroupGrade` reads Submission.score, not the numeric column beside it.
    // A grade seeded only into numericPercentage renders as an empty box and
    // leaves every follower reading "no grade yet".
    for (const plan of GBA300_GROUP_PLANS) {
      if (!plan.grade) continue;
      expect(plan.grade.score.trim()).not.toBe('');
    }
  });

  test('an individual grade belongs to a member of that group', () => {
    for (const plan of GBA300_GROUP_PLANS) {
      const override = plan.grade?.override;
      if (!override) continue;
      expect(plan.members).toContain(override.author);
    }
  });

  test('a reply to the teacher comes from someone in the group', () => {
    for (const plan of GBA300_GROUP_PLANS) {
      const reply = plan.comment?.reply;
      if (!reply) continue;
      expect(plan.members).toContain(reply.author);
    }
  });

  test('covers drafting, submitted and graded so every view has data', () => {
    const stages = new Set(GBA300_GROUP_PLANS.map((plan) => plan.stage));
    expect(stages).toEqual(new Set(['drafting', 'submitted', 'graded']));
  });

  test('shows an uneven split, which is what the breakdown is for', () => {
    // A demo where everyone wrote the same amount cannot show the teacher what
    // the contribution view is actually there to tell them.
    const drafting = GBA300_GROUP_PLANS.find(
      (plan) => plan.label === 'Group 1'
    );
    const room = buildCollabRoom(drafting!.contributions);
    const counts = room.authors.map((author) => author.charsInserted);

    expect(Math.max(...counts)).toBeGreaterThan(Math.min(...counts) * 3);
  });

  test('cohort emails are unique and follow the dev pattern', () => {
    const emails = GBA300_COHORT.map((student) => cohortEmail(student.key));
    expect(new Set(emails).size).toBe(emails.length);
    expect(emails.every((email) => email.endsWith('@yawp.local'))).toBe(true);
  });
});
