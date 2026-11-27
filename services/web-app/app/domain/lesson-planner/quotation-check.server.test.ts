/**
 * The quotation check (Nov 22, lesson review pattern 2), on the real
 * replies the review read: Owen's "Dulce et Decorum Est" printed with two
 * lines invented and two missing, Gatsby's "one of the few honest people"
 * taught as chapter 1 (it ends chapter 3), and a Macbeth aside that was
 * right and must stay as it is. The sources are fixture copies of the
 * texts, never the network.
 */
import { beforeEach, describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  checkQuotations,
  clearPreparedSources,
  prepareSource,
  readNumber,
  withQuotationCheck,
} from './quotation-check.server';
import {
  clearSourceTextCache,
  registeredWork,
  stripGutenberg,
} from './source-texts.server';

const fixture = (name: string) =>
  readFileSync(join(import.meta.dir, 'fixtures', 'accuracy', name), 'utf8');

const OWEN = stripGutenberg(fixture('source-owen-poems.txt'));
const GATSBY = stripGutenberg(fixture('source-gatsby.txt'));
const MACBETH = stripGutenberg(fixture('source-macbeth.txt'));
const owen = registeredWork('wilfred-owen')!;
const gatsby = registeredWork('great-gatsby')!;
const macbeth = registeredWork('macbeth')!;

/** The reply with each correction undone: what the check changed, and nothing else. */
const undo = (
  reply: string,
  corrections: Array<{ before: string; after: string }>
) => corrections.reduce((text, c) => text.replace(c.after, c.before), reply);

/** The poem's lines on the reply's handout, from its first line to its last. */
const handoutPoem = (reply: string) => {
  const start = reply.indexOf('Bent double');
  return reply.slice(start, reply.indexOf('*Pro patria mori.*', start) + 18);
};

describe('Dulce et Decorum Est (b3): the poem goes to students as Owen wrote it', () => {
  const reply = fixture('reply-dulce.md');
  const result = checkQuotations(reply, OWEN, { work: owen });
  const poem = handoutPoem(result.reply);

  test('the missing lines are back, the invented ones gone', () => {
    expect(poem).toContain(
      'My friend, you would not tell with such high zest\nTo children ardent for some desperate glory,'
    );
    expect(poem).toContain(
      'Behind the wagon that we flung him in,\nAnd watch the white eyes writhing in his face,'
    );
    expect(poem).toContain('Of vile, incurable sores on innocent tongues,—');
    expect(poem).toContain(
      'Of tired, outstripped Five-Nines that dropped behind.'
    );
    expect(poem).not.toContain('Behind me, haggard');
    expect(poem).not.toContain('incestuous');
    expect(poem).not.toContain('gas-shells dropping softly');
  });

  test('line for line the poem, in its stanzas, the lines that were right kept as written', () => {
    const lines = poem.split('\n');
    expect(lines.filter((line) => line.trim()).length).toBe(28);
    expect(lines.filter((line) => !line.trim()).length).toBe(3);
    expect(lines[0]).toBe('Bent double, like old beggars under sacks,');
    expect(poem).toContain('Gas! GAS! Quick, boys! — An ecstasy of fumbling');
    expect(lines[lines.length - 2]).toBe('The old Lie: *Dulce et decorum est*');
    expect(lines[lines.length - 1]).toBe('*Pro patria mori.*');
  });

  test('one correction, saying what was wrong, and nothing outside the poem changed', () => {
    expect(result.corrections).toHaveLength(1);
    const [correction] = result.corrections;
    expect(correction.why).toContain('Behind me, haggard');
    expect(correction.why).toContain('My friend, you would not tell');
    expect(correction.why).toContain('Poems (1920)');
    expect(undo(result.reply, result.corrections)).toBe(reply);
  });

  test('the misquotation in the mini-lesson is reported, with the words Owen wrote', () => {
    const writhe = result.unverified.find((u) =>
      u.quote.includes('writhe in death')
    );
    expect(writhe?.closest).toContain('white eyes writhing');
    // What the poem does say, and the teacher's own words, are not reported.
    expect(result.unverified.map((u) => u.quote).join(' ')).not.toContain(
      'gargling'
    );
    expect(result.unverified.map((u) => u.quote).join(' ')).not.toContain(
      'Hold onto'
    );
    expect(result.verified.join(' ')).toContain(
      'blood / Come gargling from the froth-corrupted lungs'
    );
  });

  test('a poem has no chapters: nothing is misplaced', () => {
    expect(result.misplaced).toEqual([]);
  });

  test('checked twice, the corrected reply needs nothing more', () => {
    const again = checkQuotations(result.reply, OWEN, { work: owen });
    expect(again.corrections).toEqual([]);
    expect(again.reply).toBe(result.reply);
  });
});

describe('The Great Gatsby (c2): the honest-people line ends chapter 3', () => {
  test('the plan: "I’m" corrected to the text, and the chapter 1 claim caught', () => {
    const reply = fixture('reply-gatsby-1.md');
    const result = checkQuotations(reply, GATSBY, { work: gatsby });
    expect(result.corrections.map((c) => [c.before, c.after])).toContainEqual([
      "I'm one of the few honest people that I have ever known.",
      'I am one of the few honest people that I have ever known.',
    ]);
    expect(result.corrections[0].why).toContain('Chapter 3');
    expect(result.reply).toContain(
      'ending roughly at "I am one of the few honest people that I have ever known."'
    );
    expect(result.reply).not.toContain("I'm one of the few honest people");
    expect(undo(result.reply, result.corrections)).toBe(reply);
    expect(result.misplaced).toContainEqual({
      quote: 'I am one of the few honest people that I have ever known.',
      claimed: 'Chapter 1',
      actual: 'Chapter 3',
    });
    // Said once, not once for every time the lesson comes back to it.
    expect(
      result.misplaced.filter((m) => m.quote.includes('honest people'))
    ).toHaveLength(1);
    // "Her voice is full of money" is Gatsby's, in chapter 7.
    expect(
      result.misplaced.find((m) => m.quote.includes('full of money'))?.actual
    ).toBe('Chapter 7');
  });

  test('the handout: the opening printed right is left alone, the chapter 3 line still caught', () => {
    const reply = fixture('reply-gatsby-2.md');
    const result = checkQuotations(reply, GATSBY, { work: gatsby });
    expect(result.corrections).toEqual([]);
    expect(result.reply).toBe(reply);
    // "criticizing anyone" is the 1925 "any one": the same words.
    expect(result.verified.join(' ')).toContain('criticizing anyone');
    expect(result.verified.join(' ')).toContain(
      'Reserving judgments is a matter of infinite hope.'
    );
    expect(result.misplaced).toEqual([
      {
        quote: 'one of the few honest people that I have ever known.',
        claimed: "Chapter 1 (the lesson's reading)",
        actual: 'Chapter 3',
      },
    ]);
  });
});

describe('Macbeth (t0): an aside quoted right stays as it is', () => {
  for (const name of ['reply-macbeth-1.md', 'reply-macbeth-2.md']) {
    test(name, () => {
      const reply = fixture(name);
      const result = checkQuotations(reply, MACBETH, { work: macbeth });
      expect(result.reply).toBe(reply);
      expect(result.corrections).toEqual([]);
      expect(result.misplaced).toEqual([]);
      expect(result.unverified).toEqual([]);
      expect(result.verified.join(' ')).toContain(
        'This supernatural soliciting'
      );
    });
  }

  const deck = (body: string) =>
    [
      '# Act 5, Scene 5',
      '',
      '```yawp-slides',
      JSON.stringify(
        {
          title: 'Tomorrow',
          slides: [
            { layout: 'title', title: 'Tomorrow', speakerNotes: 'n' },
            {
              layout: 'excerpt',
              title: 'The speech',
              body,
              speakerNotes: 'Read it twice.',
            },
          ],
        },
        null,
        2
      ),
      '```',
    ].join('\n');

  test('a slide’s excerpt with a line invented in the middle takes the source’s lines', () => {
    const reply = deck(
      'Tomorrow, and tomorrow, and tomorrow, / Creeps in this petty pace from day to day, / Until the very end of all our days; / And all our yesterdays have lighted fools / The way to dusty death.'
    );
    const result = checkQuotations(reply, MACBETH, { work: macbeth });
    const fence = result.reply.slice(
      result.reply.indexOf('{'),
      result.reply.lastIndexOf('}') + 1
    );
    const body = JSON.parse(fence).slides[1].body as string;
    expect(body).toBe(
      'Tomorrow, and tomorrow, and tomorrow, / Creeps in this petty pace from day to day, / To the last syllable of recorded time; / And all our yesterdays have lighted fools / The way to dusty death.'
    );
    expect(result.corrections[0].why).toContain('Act 5, Scene 5');
  });

  test('a single line misremembered takes the source’s wording; the act it is in is checked', () => {
    const reply =
      '# Act 1, Scene 3\n\nIn Act 1, Scene 3, Macbeth says, "Life is but a walking shadow; a poor player, that struts and frets his hour upon the stage."';
    const result = checkQuotations(reply, MACBETH, { work: macbeth });
    expect(result.reply).toContain(
      `"Life’s but a walking shadow; a poor player, That struts and frets his hour upon the stage."`
    );
    expect(result.misplaced).toEqual([
      {
        quote:
          'Life’s but a walking shadow; a poor player, That struts and frets his hour upon the stage.',
        claimed: 'Act 1, Scene 3',
        actual: 'Act 5, Scene 5',
      },
    ]);
  });

  test('“Tomorrow” is Gutenberg’s “To-morrow”; spelling of a word break is not a misquotation', () => {
    const reply =
      'He says: "Tomorrow, and tomorrow, and tomorrow, creeps in this petty pace from day to day."';
    const result = checkQuotations(reply, MACBETH, { work: macbeth });
    expect(result.reply).toBe(reply);
    expect(result.verified).toHaveLength(1);
  });

  test('a blockquote garbled in the middle keeps its "> "', () => {
    const reply = [
      'Read it aloud.',
      '',
      '> If good, why do I yield to that suggestion',
      '> Whose dreadful picture makes my hair stand up',
      '> And make my seated heart knock at my ribs,',
      '> Against the use of nature? Present fears',
      '',
      'Then discuss.',
    ].join('\n');
    const result = checkQuotations(reply, MACBETH, { work: macbeth });
    expect(result.reply).toBe(
      [
        'Read it aloud.',
        '',
        '> If good, why do I yield to that suggestion',
        '> Whose horrid image doth unfix my hair,',
        '> And make my seated heart knock at my ribs,',
        '> Against the use of nature? Present fears',
        '',
        'Then discuss.',
      ].join('\n')
    );
  });

  test('the teacher’s own words in quotation marks are never touched or reported', () => {
    const reply =
      'Say: "Hold that thought. That is what we are reading today, so keep it close." Then ask, "What did Macbeth almost lose in those twelve lines?"';
    const result = checkQuotations(reply, MACBETH, { work: macbeth });
    expect(result).toMatchObject({
      reply,
      corrections: [],
      unverified: [],
      misplaced: [],
    });
  });
});

describe('a translation is checked, never corrected against', () => {
  test('Butler is not Fagles', () => {
    const reply =
      '> If good, why do I yield to that suggestion\n> Whose dreadful picture makes my hair stand up\n> And make my seated heart knock at my ribs,';
    const result = checkQuotations(reply, MACBETH, {
      work: macbeth,
      verifyOnly: true,
    });
    expect(result.reply).toBe(reply);
    expect(result.corrections).toEqual([]);
    expect(result.unverified.map((u) => u.quote)).toEqual([
      'Whose dreadful picture makes my hair stand up',
    ]);
  });
});

describe('never throws, and is quick', () => {
  test('nothing to check, or nothing to check against', () => {
    expect(checkQuotations('', MACBETH).reply).toBe('');
    expect(
      checkQuotations('"An unfinished quotation ```yawp-slides\n{"a": "b', '')
        .reply
    ).toBe('"An unfinished quotation ```yawp-slides\n{"a": "b');
    const odd =
      '```yawp-slides\n{"slides": [{"layout": "excerpt", "body": "\\u00e9 \\" / x"}]\n```\n> \n> ...\n>';
    expect(checkQuotations(odd, MACBETH, { work: macbeth }).reply).toBe(odd);
  });

  test('a novel-sized text and a whole reply in well under a second', () => {
    const big = `${Array(40).fill(fixture('reply-their-eyes-1.md')).join('\n\n')}\n\n${GATSBY}`;
    const source = prepareSource(big, 'chapters');
    const started = performance.now();
    const result = checkQuotations(fixture('reply-gatsby-1.md'), source, {
      work: gatsby,
    });
    expect(performance.now() - started).toBeLessThan(1_000);
    expect(result.misplaced.length).toBeGreaterThan(0);
  });

  test('numbers as the texts write them', () => {
    expect(readNumber('III')).toBe(3);
    expect(readNumber('IX.')).toBe(9);
    expect(readNumber('12')).toBe(12);
    expect(readNumber('seven')).toBe(7);
    expect(readNumber('Gas')).toBeNull();
  });
});

describe('with the work found and fetched', () => {
  beforeEach(() => {
    clearSourceTextCache();
    clearPreparedSources();
  });

  test('the Dulce reply, its text fetched once', async () => {
    let calls = 0;
    const fetch = async () => {
      calls += 1;
      return new Response(fixture('source-owen-poems.txt'));
    };
    const reply = fixture('reply-dulce.md');
    const result = await withQuotationCheck(reply, { fetch });
    expect(result.work?.id).toBe('wilfred-owen');
    expect(result.reply).toContain(
      'My friend, you would not tell with such high zest'
    );
    await withQuotationCheck(reply, { fetch });
    expect(calls).toBe(1);
  });

  test('a work not registered, or a text that cannot be had, leaves the reply as it was', async () => {
    const reply = fixture('reply-their-eyes-1.md');
    const none = await withQuotationCheck(reply, {
      fetch: async () => {
        throw new Error('not asked');
      },
    });
    expect(none).toMatchObject({ reply, work: null, corrections: [] });
    const dulce = fixture('reply-dulce.md');
    const offline = await withQuotationCheck(dulce, {
      fetch: async () => {
        throw new Error('offline');
      },
    });
    expect(offline.reply).toBe(dulce);
    expect(offline.work?.id).toBe('wilfred-owen');
  });
});

describe('a prose passage is corrected a sentence at a time, never into the next (memoir handout, Nov 24)', () => {
  // The Douglass handout printed "bear heavily upon my." (a word lost) and a
  // stray fragment repeating the next paragraph: a sentence the planner wrote
  // a little long or short was replaced with the same number of the book's
  // words, which ran past (or stopped short of) the sentence's end.
  const handout = (sentence: string) => `## Handout: Chapter 1 opening

> He didn't say any more, but we've always been unusually communicative in a reserved way, and I understood that he meant a great deal more than that. In consequence, I'm inclined to reserve all judgments, a habit that has opened up many curious natures to me and also made me the victim of not a few veteran bores. Reserving judgments is a matter of infinite hope. ${sentence}
>
> And, after boasting this way of my tolerance, I come to the admission that it has a limit. Conduct may be founded on the hard rock or the wet marshes, but after a certain point I don't care what it's founded on.

1. What does Nick mean by "reserve all judgments"?`;

  test('a sentence with words added ends where the book ends it, and the next paragraph is not pulled in', () => {
    const reply = handout(
      'I am still a little afraid of missing something if I forget that, as my father snobbishly suggested, and I snobbishly repeat, a sense of the fundamental decencies is parcelled out unequally at birth, and it weighs upon my heart.'
    );
    const out = checkQuotations(reply, GATSBY, { work: gatsby });
    expect(out.reply).toContain('a sense of the fundamental decencies is parcelled out unequally at birth.\n>\n> And, after boasting');
    expect(out.reply).not.toContain('at birth. And, after boasting.');
    expect(out.reply.match(/And, after boasting/g)?.length).toBe(1);
  });

  test('a sentence whose last words are off ends on the book\'s last word, not cut short ("upon my.")', () => {
    const reply = handout(
      'I am still a little afraid of missing something if I forget that, as my father snobbishly suggested, and I snobbishly repeat, a sense of the fundamental decencies is parcelled out unequally to us all.'
    );
    const out = checkQuotations(reply, GATSBY, { work: gatsby });
    expect(out.reply).toContain('is parcelled out unequally at birth.\n>');
    expect(out.reply).not.toContain('unequally at.');
  });

  test('a sentence too far from the book to end where it ends is left as written and reported, never cut to fit', () => {
    const sentence =
      'I am still a little afraid of missing something if I forget that, as my father snobbishly suggested, and I snobbishly repeat, a sense of decency is unequal.';
    const out = checkQuotations(handout(sentence), GATSBY, { work: gatsby });
    expect(out.reply).not.toContain('a sense of.');
    expect(out.reply).toContain(sentence);
    expect(out.unverified.some((miss) => miss.quote.includes('a sense of decency is unequal'))).toBe(true);
  });

  test('a sentence one word off is still corrected word for word', () => {
    const reply = handout(
      'I am still a little afraid of missing something if I forget that, as my father snobbishly suggested, and I snobbishly repeat, a sense of the basic decencies is parcelled out unequally at birth.'
    );
    const out = checkQuotations(reply, GATSBY, { work: gatsby });
    expect(out.reply).toContain('a sense of the fundamental decencies is parcelled out unequally at birth.\n>');
  });
});
