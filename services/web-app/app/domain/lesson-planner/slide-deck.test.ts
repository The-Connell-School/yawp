import { describe, expect, test } from 'bun:test';
import {
  deckDurationMinutes,
  fenceSlideDeck,
  markFailedDecks,
  parseSlideDeck,
  readSlideDeck,
  slideSearchText,
  validateSlideDeck,
  SLIDE_DECK_FENCE,
  SLIDE_LAYOUTS,
} from './slide-deck';

function fenced(deck: unknown): string {
  return `Here is your deck.\n\n\`\`\`${SLIDE_DECK_FENCE}\n${JSON.stringify(
    deck,
    null,
    2
  )}\n\`\`\`\n\nWant me to change anything?`;
}

const validDeck = {
  title: 'Evidence that earns its place',
  subtitle: 'English 10 · Period 3',
  slides: [
    {
      layout: 'title',
      title: 'Evidence that earns its place',
      subtitle: 'Why some quotes land and others sit there',
      speakerNotes: 'Set the stakes before naming the skill.',
      minutes: 1,
    },
    {
      layout: 'compare',
      title: 'Which one makes you cringe?',
      left: { label: 'Version A', text: 'The author says the door slammed.' },
      right: {
        label: 'Version B',
        text: 'When the door slams, she is done talking.',
      },
      speakerNotes: 'Let them write for three minutes before anyone speaks.',
      minutes: 5,
    },
    {
      layout: 'bullets',
      title: 'What changed',
      bullets: ['The verb does work', 'The quote is inside the sentence'],
      speakerNotes: 'Draw the second bullet out of them; do not give it.',
      minutes: 4,
    },
  ],
};

describe('parseSlideDeck', () => {
  test('reads a deck out of a fenced block', () => {
    const parsed = parseSlideDeck(fenced(validDeck));
    expect(parsed?.deck.title).toBe('Evidence that earns its place');
    expect(parsed?.deck.slides).toHaveLength(3);
  });

  test('returns the surrounding prose with the block removed', () => {
    const parsed = parseSlideDeck(fenced(validDeck));
    expect(parsed?.body).toContain('Here is your deck.');
    expect(parsed?.body).toContain('Want me to change anything?');
    // The teacher must never see the raw JSON.
    expect(parsed?.body).not.toContain('speakerNotes');
    expect(parsed?.body).not.toContain(SLIDE_DECK_FENCE);
  });

  test('is null when there is no deck at all', () => {
    expect(parseSlideDeck('Just a lesson plan, no deck here.')).toBeNull();
  });

  test('falls back to null rather than half a deck when the JSON is broken', () => {
    const broken = `\`\`\`${SLIDE_DECK_FENCE}\n{ "title": "Oops", slides: [ \n\`\`\``;
    expect(parseSlideDeck(broken)).toBeNull();
  });

  test('rejects a deck whose slides do not match the schema', () => {
    const bad = { title: 'Deck', slides: [{ layout: 'bullets' }] };
    expect(parseSlideDeck(fenced(bad))).toBeNull();
  });

  test('rejects an unknown layout instead of guessing one', () => {
    const bad = {
      title: 'Deck',
      slides: [
        { layout: 'interpretive-dance', title: 'Hm', speakerNotes: 'No.' },
      ],
    };
    expect(parseSlideDeck(fenced(bad))).toBeNull();
  });

  test('requires every slide to carry speaker notes', () => {
    const bad = {
      title: 'Deck',
      slides: [{ layout: 'statement', title: 'A claim', body: 'Something' }],
    };
    expect(parseSlideDeck(fenced(bad))).toBeNull();
  });

  test('rejects an empty deck', () => {
    expect(parseSlideDeck(fenced({ title: 'Deck', slides: [] }))).toBeNull();
  });

  test('rejects a slide too wordy to read from the back of a room', () => {
    const wordy = {
      title: 'Deck',
      slides: [
        {
          layout: 'bullets',
          title: 'Too much',
          bullets: [`${'word '.repeat(60)}`],
          speakerNotes: 'These belong in the notes, not on the wall.',
        },
      ],
    };
    expect(parseSlideDeck(fenced(wordy))).toBeNull();
  });

  test('rejects more bullets than a class can hold at once', () => {
    const crowded = {
      title: 'Deck',
      slides: [
        {
          layout: 'bullets',
          title: 'Crowded',
          bullets: Array.from({ length: 9 }, (_unused, i) => `Point ${i + 1}`),
          speakerNotes: 'Split this across slides.',
        },
      ],
    };
    expect(parseSlideDeck(fenced(crowded))).toBeNull();
  });

  test('accepts every layout it advertises', () => {
    for (const layout of SLIDE_LAYOUTS) {
      const slide: Record<string, unknown> = {
        layout,
        title: 'A slide',
        speakerNotes: 'Say the thing.',
      };
      if (layout === 'bullets' || layout === 'steps') {
        slide.bullets = ['One', 'Two'];
      }
      if (layout === 'compare') {
        slide.left = { label: 'A', text: 'One' };
        slide.right = { label: 'B', text: 'Two' };
      }
      if (layout === 'statement' || layout === 'prompt' || layout === 'quote') {
        slide.body = 'The body.';
      }
      const parsed = parseSlideDeck(fenced({ title: 'Deck', slides: [slide] }));
      expect(parsed?.deck.slides[0]!.layout).toBe(layout);
    }
  });

  test('requires the pieces each layout is made of', () => {
    const missingColumns = {
      title: 'Deck',
      slides: [
        { layout: 'compare', title: 'Two of them', speakerNotes: 'Compare.' },
      ],
    };
    expect(parseSlideDeck(fenced(missingColumns))).toBeNull();

    const missingBullets = {
      title: 'Deck',
      slides: [
        { layout: 'bullets', title: 'Nothing here', speakerNotes: 'Hm.' },
      ],
    };
    expect(parseSlideDeck(fenced(missingBullets))).toBeNull();
  });
});

describe('deckDurationMinutes', () => {
  test('adds up the slides that claim a time', () => {
    const parsed = parseSlideDeck(fenced(validDeck))!;
    expect(deckDurationMinutes(parsed.deck)).toBe(10);
  });

  test('is zero when no slide is timed', () => {
    const untimed = parseSlideDeck(
      fenced({
        title: 'Deck',
        slides: [
          { layout: 'statement', title: 'A', body: 'B', speakerNotes: 'C' },
        ],
      })
    )!;
    expect(deckDurationMinutes(untimed.deck)).toBe(0);
  });
});

describe('slideSearchText', () => {
  test('flattens a slide to the words actually on screen', () => {
    const parsed = parseSlideDeck(fenced(validDeck))!;
    const text = slideSearchText(parsed.deck.slides[1]!);
    expect(text).toContain('Which one makes you cringe?');
    expect(text).toContain('Version A');
    expect(text).toContain('the door slammed');
    // Speaker notes are not on screen.
    expect(text).not.toContain('three minutes');
  });
});

describe('readSlideDeck — never show a teacher raw JSON', () => {
  test('strips a deck-shaped block that fails validation and says so', () => {
    // What actually happened: the model wrote "prompt" where the schema wants
    // "body", so the deck failed and the JSON rendered as a code block.
    const broken = `Here's the deck:\n\n\`\`\`${SLIDE_DECK_FENCE}\n${JSON.stringify(
      { title: 'Deck', slides: [{ layout: 'bullets', title: 'No bullets' }] }
    )}\n\`\`\``;

    const outcome = readSlideDeck(broken);
    expect(outcome.kind).toBe('unreadable');
    if (outcome.kind !== 'none') {
      expect(outcome.body).toContain("Here's the deck:");
      expect(outcome.body).not.toContain('layout');
      expect(outcome.body).not.toContain('{');
    }
  });

  test('finds a deck fenced as json rather than by its tag', () => {
    const deck = {
      title: 'Deck',
      slides: [
        { layout: 'statement', title: 'A', body: 'B', speakerNotes: 'C' },
      ],
    };
    const outcome = readSlideDeck(
      `Here it is.\n\n\`\`\`json\n${JSON.stringify(deck)}\n\`\`\``
    );
    expect(outcome.kind).toBe('deck');
  });

  test('finds a deck in an untagged fence', () => {
    const deck = {
      title: 'Deck',
      slides: [
        { layout: 'statement', title: 'A', body: 'B', speakerNotes: 'C' },
      ],
    };
    const outcome = readSlideDeck(
      `Here it is.\n\n\`\`\`\n${JSON.stringify(deck)}\n\`\`\``
    );
    expect(outcome.kind).toBe('deck');
  });

  test('leaves an ordinary code block alone', () => {
    const outcome = readSlideDeck('Try this:\n\n```\nconst x = 1;\n```');
    expect(outcome.kind).toBe('none');
  });

  test('reports no deck when the reply has none', () => {
    expect(readSlideDeck('Just a plan.').kind).toBe('none');
  });
});

describe('readSlideDeck — says why a deck failed', () => {
  test('names the field and the rule a slide broke', () => {
    const outcome = readSlideDeck(
      fenced({
        title: 'Deck',
        slides: [
          { layout: 'statement', title: 'A claim', body: 'Something' },
          {
            layout: 'bullets',
            title: 'No bullets here',
            speakerNotes: 'Hm.',
          },
        ],
      })
    );
    expect(outcome.kind).toBe('unreadable');
    if (outcome.kind !== 'unreadable') throw new Error('expected unreadable');
    // Which slide, which field, and what was wrong with it — enough for the
    // model to fix it on a second pass instead of guessing.
    expect(outcome.reason).toContain('slides.0.speakerNotes');
    expect(outcome.reason).toContain('slides.1.bullets');
  });

  test('says the deck was cut off when the JSON never finished', () => {
    const truncated = `Here you go.\n\n\`\`\`${SLIDE_DECK_FENCE}\n{ "title": "Deck", "slides": [ { "layout": "title",\n\`\`\``;
    const outcome = readSlideDeck(truncated);
    expect(outcome.kind).toBe('unreadable');
    if (outcome.kind !== 'unreadable') throw new Error('expected unreadable');
    expect(outcome.reason.toLowerCase()).toContain('cut off');
  });

  test('hands back the exact block and JSON so it can be repaired in place', () => {
    const content = fenced({
      title: 'Deck',
      slides: [{ layout: 'bullets', title: 'Nothing' }],
    });
    const outcome = readSlideDeck(content);
    if (outcome.kind !== 'unreadable') throw new Error('expected unreadable');
    expect(content).toContain(outcome.block);
    expect(outcome.json).toContain('"slides"');
    expect(outcome.json).not.toContain('```');
  });
});

describe('markFailedDecks', () => {
  test('replaces a deck that never rendered with a note saying so', () => {
    const content = `Here's the deck.\n\n\`\`\`${SLIDE_DECK_FENCE}\n${JSON.stringify(
      { title: 'Deck', slides: [{ layout: 'bullets', title: 'Nothing' }] }
    )}\n\`\`\``;

    const marked = markFailedDecks(content);
    expect(marked).toContain("Here's the deck.");
    expect(marked).not.toContain('"slides"');
    // Without this the model reads its own JSON in the history, concludes the
    // deck exists, and tells the teacher to scroll down and find it.
    expect(marked.toLowerCase()).toContain('failed');
    expect(marked.toLowerCase()).toContain('build it again');
  });

  test('leaves a deck that worked in the history, so it can be edited', () => {
    const content = fenced(validDeck);
    expect(markFailedDecks(content)).toBe(content);
  });

  test('leaves a reply with no deck untouched', () => {
    expect(markFailedDecks('Just a plan.')).toBe('Just a plan.');
  });
});

describe('validateSlideDeck', () => {
  test('accepts good JSON and returns the parsed deck', () => {
    const result = validateSlideDeck(JSON.stringify(validDeck));
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.deck.slides).toHaveLength(3);
  });

  test('reports the reason instead of throwing on bad JSON', () => {
    const result = validateSlideDeck('{ "slides": [ ');
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.reason.toLowerCase()).toContain('cut off');
  });

  test('shows the text around a syntax error, not just that there was one', () => {
    // The realistic break: a speaker note quoting the text, with the quote
    // marks left unescaped.
    const broken = `{"title":"Deck","slides":[{"layout":"statement","title":"A","body":"B","speakerNotes":"Close with "every quote is a promise" and stop."}]}`;
    const result = validateSlideDeck(broken);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.reason).toContain('every quote is a promise');
  });

  test('forgives a trailing comma rather than spending a round on it', () => {
    const result = validateSlideDeck(
      '{"title":"Deck","slides":[{"layout":"statement","title":"A","body":"B","speakerNotes":"C",},]}'
    );
    expect(result.ok).toBe(true);
  });
});

describe('fenceSlideDeck', () => {
  test('round-trips a deck back into a block readSlideDeck can read', () => {
    const deck = parseSlideDeck(fenced(validDeck))!.deck;
    const outcome = readSlideDeck(`Here it is.\n\n${fenceSlideDeck(deck)}`);
    expect(outcome.kind).toBe('deck');
    expect(fenceSlideDeck(deck)).toContain(`\`\`\`${SLIDE_DECK_FENCE}`);
  });
});

describe('parseSlideDeck — the shapes a model actually writes', () => {
  function oneSlide(slide: Record<string, unknown>) {
    return parseSlideDeck(fenced({ title: 'Deck', slides: [slide] }))?.deck
      .slides[0];
  }

  test('takes a time box written the way a lesson plan writes it', () => {
    // A planner that time-boxes everything writes "5-7" and "3 min" as readily
    // as 5. z.coerce turns those into NaN, which used to kill the whole deck.
    expect(
      oneSlide({
        layout: 'statement',
        title: 'A',
        body: 'B',
        speakerNotes: 'C',
        minutes: '5-7',
      })?.minutes
    ).toBe(5);
    expect(
      oneSlide({
        layout: 'statement',
        title: 'A',
        body: 'B',
        speakerNotes: 'C',
        minutes: '3 min',
      })?.minutes
    ).toBe(3);
  });

  test('drops a time box it cannot read rather than losing the slide', () => {
    const slide = oneSlide({
      layout: 'statement',
      title: 'A',
      body: 'B',
      speakerNotes: 'C',
      minutes: 'a few',
    });
    expect(slide).toBeTruthy();
    expect(slide?.minutes).toBeUndefined();
  });

  test('reads bullets written as objects', () => {
    expect(
      oneSlide({
        layout: 'bullets',
        title: 'Points',
        bullets: [
          { text: 'The verb does the work' },
          { text: 'Keep it short' },
        ],
        speakerNotes: 'Say it.',
      })?.bullets
    ).toEqual(['The verb does the work', 'Keep it short']);
  });

  test('reads bullets written as one block of lines', () => {
    expect(
      oneSlide({
        layout: 'bullets',
        title: 'Points',
        bullets: '- The verb does the work\n- Keep it short',
        speakerNotes: 'Say it.',
      })?.bullets
    ).toEqual(['The verb does the work', 'Keep it short']);
  });

  test('joins speaker notes written as a list of lines', () => {
    expect(
      oneSlide({
        layout: 'statement',
        title: 'A',
        body: 'B',
        speakerNotes: ['Ask first.', 'Then show the model.'],
      })?.speakerNotes
    ).toBe('Ask first.\nThen show the model.');
  });

  test('understands the names a model picks for a layout', () => {
    expect(
      oneSlide({
        layout: 'bullet',
        title: 'A',
        bullets: ['One'],
        speakerNotes: 'B',
      })?.layout
    ).toBe('bullets');
    expect(
      oneSlide({
        layout: 'question',
        title: 'A',
        body: 'B',
        speakerNotes: 'C',
      })?.layout
    ).toBe('prompt');
    expect(
      oneSlide({
        layout: 'exit-ticket',
        title: 'A',
        body: 'B',
        speakerNotes: 'C',
      })?.layout
    ).toBe('closing');
    expect(
      oneSlide({
        layout: 'instructions',
        title: 'A',
        bullets: ['One'],
        speakerNotes: 'B',
      })?.layout
    ).toBe('steps');
  });

  test('infers the layout from the slide when none was given', () => {
    expect(
      oneSlide({ title: 'A', bullets: ['One'], speakerNotes: 'B' })?.layout
    ).toBe('bullets');
    expect(
      oneSlide({
        title: 'A',
        left: { label: 'A', text: 'One' },
        right: { label: 'B', text: 'Two' },
        speakerNotes: 'C',
      })?.layout
    ).toBe('compare');
    expect(oneSlide({ title: 'A', body: 'B', speakerNotes: 'C' })?.layout).toBe(
      'statement'
    );
    expect(oneSlide({ title: 'A', speakerNotes: 'B' })?.layout).toBe('title');
  });

  test('still refuses a layout that means nothing', () => {
    expect(
      oneSlide({
        layout: 'interpretive-dance',
        title: 'A',
        speakerNotes: 'B',
      })
    ).toBeUndefined();
  });
});

describe('parseSlideDeck — room for real classroom writing', () => {
  test('lets a compare slide hold two versions of a paragraph', () => {
    // The failure a teacher actually hit: "show them a weak conclusion next to
    // a strong one" is two paragraphs, not two phrases.
    const paragraph =
      'In conclusion, this essay has shown that the author uses many literary devices to make his point, and these devices are important to the meaning of the story overall.';
    const parsed = parseSlideDeck(
      fenced({
        title: 'Deck',
        slides: [
          {
            layout: 'compare',
            title: 'Which one earns the ending?',
            left: { label: 'Before', text: paragraph },
            right: { label: 'After', text: paragraph },
            speakerNotes: 'Read both aloud before anyone votes.',
          },
        ],
      })
    );
    expect(parsed?.deck.slides[0]!.left?.text).toBe(paragraph);
  });

  test('keeps a compare column that carries an extra key', () => {
    const parsed = parseSlideDeck(
      fenced({
        title: 'Deck',
        slides: [
          {
            layout: 'compare',
            title: 'Two drafts',
            left: { heading: 'Draft one', text: 'Weak.', note: 'ignore me' },
            right: { label: 'Draft two', text: 'Strong.' },
            speakerNotes: 'Compare.',
          },
        ],
      })
    );
    expect(parsed?.deck.slides[0]!.left?.label).toBe('Draft one');
    expect(parsed?.deck.slides[0]!.right?.label).toBe('Draft two');
  });
});

describe('parseSlideDeck — forgiving about how the model writes it', () => {
  test('accepts prompt on a prompt slide, which is the obvious mistake', () => {
    const parsed = parseSlideDeck(
      fenced({
        title: 'Deck',
        slides: [
          {
            layout: 'prompt',
            title: 'Warm-Up (3 min)',
            prompt: 'Think of a time you tried to convince someone.',
            speakerNotes: 'Three full minutes of quiet writing.',
            minutes: 5,
          },
        ],
      })
    );
    expect(parsed?.deck.slides[0]!.body).toBe(
      'Think of a time you tried to convince someone.'
    );
  });

  test('accepts other near-miss field names', () => {
    const parsed = parseSlideDeck(
      fenced({
        title: 'Deck',
        slides: [
          {
            layout: 'bullets',
            title: 'Points',
            items: ['One', 'Two'],
            notes: 'Say it.',
          },
        ],
      })
    );
    expect(parsed?.deck.slides[0]!.bullets).toEqual(['One', 'Two']);
    expect(parsed?.deck.slides[0]!.speakerNotes).toBe('Say it.');
  });

  test('ignores a stray field instead of losing the whole deck', () => {
    const parsed = parseSlideDeck(
      fenced({
        title: 'Deck',
        slides: [
          {
            layout: 'statement',
            title: 'A claim',
            body: 'The body.',
            speakerNotes: 'Say it.',
            transition: 'fade',
          },
        ],
      })
    );
    expect(parsed?.deck.slides).toHaveLength(1);
  });

  test('strips numbering the model typed into bullets itself', () => {
    const parsed = parseSlideDeck(
      fenced({
        title: 'Deck',
        slides: [
          {
            layout: 'steps',
            title: 'The Three Jobs',
            bullets: [
              '1. Introduce — signal phrase before the quote',
              '2. Integrate — quote sits inside your sentence',
            ],
            speakerNotes: 'Walk them through it.',
          },
        ],
      })
    );
    // The steps layout numbers them; typed numbers would double up.
    expect(parsed?.deck.slides[0]!.bullets).toEqual([
      'Introduce — signal phrase before the quote',
      'Integrate — quote sits inside your sentence',
    ]);
  });

  test('takes minutes written as a string', () => {
    const parsed = parseSlideDeck(
      fenced({
        title: 'Deck',
        slides: [
          {
            layout: 'statement',
            title: 'A',
            body: 'B',
            speakerNotes: 'C',
            minutes: '5',
          },
        ],
      })
    );
    expect(parsed?.deck.slides[0]!.minutes).toBe(5);
  });
});
