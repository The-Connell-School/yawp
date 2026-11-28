/**
 * The fact check (Nov 22, lesson review pattern 2): a second model lists the
 * reply's errors of fact; the sure ones that can be placed safely are made,
 * the rest go to the teacher. The model is a stub answering as it would on
 * the real Odyssey reply (a3: "twelve men on that raft"; six survive, and
 * they escape by ship).
 */
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  FACT_CHECK_SCHEMA,
  FACT_CHECK_SYSTEM,
  factCheckPrompt,
  readFactCheckAnswer,
  withFactCheck,
} from './fact-check.server';

const ODYSSEY = readFileSync(
  join(import.meta.dir, 'fixtures', 'accuracy', 'reply-odyssey-1.md'),
  'utf8'
);

const answering =
  (errors: unknown[], { prefix = '' } = {}) =>
  async () =>
    `${prefix}${JSON.stringify({ errors })}`;

const deckOf = (reply: string) =>
  JSON.parse(
    reply.slice(reply.indexOf('```yawp-slides') + 14, reply.lastIndexOf('```'))
  );

describe('the Odyssey reply (a3)', () => {
  test('a sure error is corrected in place, in the plan and on its slide alike (re-test, Nov 22: flagged and left on the slide)', async () => {
    const result = await withFactCheck(
      ODYSSEY,
      answering([
        {
          wrong: 'Escaping on the raft, Odysseus shouts his name',
          right: 'Escaping by ship, Odysseus shouts his name',
          confidence: 'high',
          why: 'Book 9: the six surviving men escape to their ship; the raft is Book 5.',
        },
        {
          wrong: 'one of the twelve men on that raft',
          right: 'one of the six men left in that ship',
          confidence: 'high',
          why: 'Book 9: Polyphemus eats six of the twelve.',
        },
      ])
    );
    expect(result.reply).toContain(
      "Escaping by ship, Odysseus shouts his name and father's name across the water"
    );
    expect(result.reply).not.toContain(
      'Escaping on the raft, Odysseus shouts his name'
    );
    expect(result.applied.map((e) => e.right)).toEqual([
      'Escaping by ship, Odysseus shouts his name',
      'one of the six men left in that ship',
    ]);
    // Twice in the reply (the plan and slide 11): both say the same wrong thing; both are corrected.
    expect(result.reply).not.toContain('one of the twelve men on that raft');
    expect(result.flagged).toEqual([]);
  });

  test('a correction inside the slide deck keeps the deck JSON whole', async () => {
    const result = await withFactCheck(
      ODYSSEY,
      answering([
        {
          wrong: 'Read lines 500–521. Escaping on the raft,',
          right: 'Read lines 500–521. Escaping by ship ("hard at the oars"),',
          confidence: 'high',
          why: 'Book 9.',
        },
      ])
    );
    expect(result.applied).toHaveLength(1);
    const deck = deckOf(result.reply);
    expect(
      deck.slides.some((s: { body?: string }) =>
        s.body?.includes('Escaping by ship ("hard at the oars")')
      )
    ).toBe(true);
  });

  test('a medium one is only flagged; a low one is dropped', async () => {
    const result = await withFactCheck(
      ODYSSEY,
      answering([
        {
          wrong: 'a decision about twelve men',
          right: 'a decision about his men',
          confidence: 'Medium',
          why: 'Twelve go in; six come out.',
        },
        {
          wrong: 'The crew matters.',
          right: 'The crew matter.',
          confidence: 'low',
          why: 'Style.',
        },
      ])
    );
    expect(result.reply).toBe(ODYSSEY);
    expect(result.applied).toEqual([]);
    expect(result.flagged).toEqual([
      {
        wrong: 'a decision about twelve men',
        right: 'a decision about his men',
        why: 'Twelve go in; six come out.',
      },
    ]);
  });
});

describe('what is never changed', () => {
  const reply = [
    '# The Crucible, Act 1',
    '',
    'The trials end in October 1692. See https://example.org/trials-end-in-1692 for more.',
    '',
    'Abigail says, "I want to open myself!" in Act 1.',
    '',
    '```yawp-material',
    'kind: handout',
    'title: The trials end in October 1692',
    '---',
    'Notes.',
    '```',
  ].join('\n');

  test('words inside an address, or a fence’s own line, or too long, or not in the reply', async () => {
    const result = await withFactCheck(
      reply,
      answering([
        {
          wrong: 'trials-end-in-1692',
          right: 'trials-end-in-1693',
          confidence: 'high',
          why: 'x',
        },
        {
          wrong: '```yawp-material',
          right: '```',
          confidence: 'high',
          why: 'x',
        },
        { wrong: 'x'.repeat(240), right: 'y', confidence: 'high', why: 'x' },
        {
          wrong: 'not in the lesson at all',
          right: 'y',
          confidence: 'high',
          why: 'x',
        },
      ])
    );
    expect(result.reply).toBe(reply);
    expect(result.applied).toEqual([]);
    expect(result.flagged).toHaveLength(4);
  });

  test('the same sentence twice (prose and handout title) is corrected in both', async () => {
    const result = await withFactCheck(
      reply,
      answering([
        {
          wrong: 'The trials end in October 1692',
          right: 'The last trials were in May 1693',
          confidence: 'high',
          why: 'The court of Oyer and Terminer ended in October 1692; the Superior Court tried the last cases in May 1693.',
        },
      ])
    );
    expect(result.reply).not.toContain('The trials end in October 1692');
    expect(result.applied).toHaveLength(1);
  });

  test('a short phrase found in several places is flagged, not guessed at', async () => {
    const result = await withFactCheck(
      reply,
      answering([{ wrong: 'October 1692', right: 'May 1693', confidence: 'high', why: 'The last trials were in May 1693.' }])
    );
    expect(result.reply).toBe(reply);
    expect(result.flagged).toHaveLength(1);
  });

  test('what the checker itself calls right as written is neither made nor shown', async () => {
    const result = await withFactCheck(
      reply,
      answering([{ wrong: 'The trials end in October 1692', right: 'The trials end in October 1692 (the court)', confidence: 'medium', why: 'The 1956 date is correct; this is only a clarification.' }])
    );
    expect(result.reply).toBe(reply);
    expect(result.flagged).toEqual([]);
  });

  test('a note that says it is not a real error is not one for the teacher (Kevin, Nov 23)', async () => {
    const result = await withFactCheck(
      reply,
      answering([{ wrong: 'The trials end in October 1692', right: 'The trials end in 1692', confidence: 'medium', why: 'The date is roughly correct; this is not a real error, so ignore.' }])
    );
    expect(result.flagged).toEqual([]);
  });

  test('a quotation the quotation check verified is protected', async () => {
    const result = await withFactCheck(
      reply,
      answering([
        {
          wrong: 'I want to open myself!',
          right: 'I want to open myself!—',
          confidence: 'high',
          why: 'x',
        },
      ]),
      { protect: ['"I want to open myself!"'] }
    );
    expect(result.reply).toBe(reply);
    expect(result.flagged).toHaveLength(1);
  });
});

describe('any failure leaves the reply as it was', () => {
  test('the model fails, says nothing, or says something else', async () => {
    const failing = async () => {
      throw new Error('overloaded');
    };
    expect(await withFactCheck(ODYSSEY, failing)).toEqual({
      reply: ODYSSEY,
      applied: [],
      flagged: [],
    });
    expect(
      await withFactCheck(ODYSSEY, async () => 'I found no errors.')
    ).toEqual({ reply: ODYSSEY, applied: [], flagged: [] });
    expect(
      await withFactCheck(ODYSSEY, async () => '{"errors": "none"}')
    ).toEqual({ reply: ODYSSEY, applied: [], flagged: [] });
    expect(await withFactCheck('', answering([]))).toEqual({
      reply: '',
      applied: [],
      flagged: [],
    });
  });

  test('an answer with a sentence before it and a fence around it is read', () => {
    const text =
      'Here is what I found:\n```json\n{"errors": [{"wrong": "a", "right": "b", "confidence": "HIGH", "why": "c"}]}\n```\nHope this helps {really}.';
    expect(readFactCheckAnswer(text)).toEqual([
      { wrong: 'a', right: 'b', confidence: 'high', why: 'c' },
    ]);
  });
});

describe('what the model is asked', () => {
  test('the whole lesson, and the rules for each error', () => {
    expect(factCheckPrompt('The lesson text.')).toContain(
      '<lesson>\nThe lesson text.\n</lesson>'
    );
    for (const words of [
      '"wrong"',
      '"right"',
      '"confidence"',
      'exactly',
      'who says it',
      'chapter',
      'dates',
    ])
      expect(FACT_CHECK_SYSTEM).toContain(words);
    expect(FACT_CHECK_SCHEMA.properties.errors.items.required).toEqual([
      'wrong',
      'right',
      'confidence',
      'why',
    ]);
  });
});

describe('the fact check also reads for invented sources and terms taught wrong (Nov 24 types test)', () => {
  // The research lesson cited "California Dreaming… Dr. Maria Sandoval, UC
  // Davis" as a real book; the speech lesson's ethos example was not ethos.
  test('an invented book, study, author or address is an error, put right with a labeled slot', () => {
    expect(FACT_CHECK_SYSTEM).toContain('invented');
    expect(FACT_CHECK_SYSTEM).toContain('study');
    expect(FACT_CHECK_SYSTEM).toContain('web address');
    expect(FACT_CHECK_SYSTEM).toContain('labeled slot');
  });
  test('a term defined wrongly, or an example that is not a case of the term, is an error', () => {
    expect(FACT_CHECK_SYSTEM).toContain('a term taught wrongly');
    expect(FACT_CHECK_SYSTEM).toContain('labeled ethos');
  });
});
