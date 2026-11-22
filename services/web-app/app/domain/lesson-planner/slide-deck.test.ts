import { describe, expect, test } from 'bun:test';
import {
  deckDurationMinutes,
  fenceSlideDeck,
  markFailedDecks,
  parseSlideDeck,
  readSlideDeck,
  slideSearchText,
  validateSlideDeck,
  classicSlide,
  deckPictureIds,
  diagramLines,
  SLIDE_DECK_FENCE,
  SLIDE_LAYOUTS,
  shortPage,
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
      // The gallery templates, each with the slot it is made of.
      if (['big_idea', 'write', 'excerpt', 'exit', 'discuss', 'look'].includes(layout)) {
        slide.body = 'The body.';
      }
      if (layout === 'agenda') slide.agenda = [{ title: 'Hook', minutes: 10 }];
      if (layout === 'notes') slide.facts = ['One fact.'];
      if (layout === 'read') slide.tasks = [{ verb: 'Circle', text: 'names' }];
      if (layout === 'picture') slide.image = 'cmh0elephant0000abcd';
      if (layout === 'timeline') slide.events = [{ date: '1899', title: 'One' }, { date: '1956', title: 'Two' }];
      if (layout === 'map') slide.places = [{ name: 'Khartoum' }];
      if (layout === 'define') slide.terms = [{ word: 'aristocracy', definition: 'Families who rule by birth.' }];
      if (layout === 'person') slide.people = [{ name: 'Garibaldi', role: 'General' }];
      if (layout === 'diagram') slide.diagram = { kind: 'parts', items: [{ label: 'Octave' }, { label: 'Sestet' }] };
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

  test('drops art ids that are not in the shipped deck-art registry', () => {
    const json = JSON.stringify({
      title: 'Deck',
      art: 'klee-castle-sun',
      slides: [{ layout: 'title', title: 'Day', speakerNotes: 'Open.', minutes: 1 }],
    });
    const validated = validateSlideDeck(json);
    expect(validated.ok).toBe(true);
    if (!validated.ok) throw new Error('expected valid deck');
    expect(validated.deck.art).toBeUndefined();
  });
});

describe('picture slides: the teacher’s own pictures (Nov 1)', () => {
  const pictureSlide = {
    layout: 'picture',
    title: 'Observe and analyze',
    question: 'What is happening in this picture?',
    image: 'cmh0elephant0000abcd',
    speakerNotes: 'Two minutes of silent looking.',
  };
  const withPicture = { ...validDeck, slides: [...validDeck.slides, pictureSlide] };

  test('a picture slide parses with its picture id', () => {
    const parsed = parseSlideDeck(fenced(withPicture));
    expect(parsed?.deck.slides[3]).toMatchObject({ layout: 'picture', image: 'cmh0elephant0000abcd' });
    expect(SLIDE_LAYOUTS).toContain('picture');
  });

  test('a picture slide with no picture is refused, by name', () => {
    const { image: _, ...noImage } = pictureSlide;
    const outcome = readSlideDeck(fenced({ ...validDeck, slides: [noImage] }));
    expect(outcome.kind).toBe('unreadable');
    expect(outcome.kind === 'unreadable' ? outcome.reason : '').toContain('slides.0.image');
  });

  test('a picture id that is not an id is dropped, never put in a URL', () => {
    const parsed = parseSlideDeck(
      fenced({ ...validDeck, slides: [...validDeck.slides, { ...validDeck.slides[2], image: '../../etc/passwd' }] })
    );
    expect(parsed?.deck.slides[3]?.image).toBeUndefined();
  });

  test('the model’s other names for a picture slide and its picture are understood', () => {
    const parsed = parseSlideDeck(
      fenced({ ...validDeck, slides: [{ ...pictureSlide, layout: 'photo', image: undefined, picture: 'cmh0elephant0000abcd' }] })
    );
    expect(parsed?.deck.slides[0]).toMatchObject({ layout: 'picture', image: 'cmh0elephant0000abcd' });
  });

  test('every renderer draws it as itself: it is not mapped to another layout', () => {
    expect(classicSlide(parseSlideDeck(fenced(withPicture))!.deck.slides[3]!).layout).toBe('picture');
  });

  test('the pictures a deck uses, once each', () => {
    const deck = parseSlideDeck(fenced({ ...withPicture, slides: [...withPicture.slides, pictureSlide] }))!.deck;
    expect(deckPictureIds(deck)).toEqual(['cmh0elephant0000abcd']);
  });
});


describe('a quiz question, however the model writes it (bot test, Nov 19)', () => {
  const deckOf = (slide: Record<string, unknown>) => parseSlideDeck(fenced({ title: 'Deck', slides: [{ title: 'Check', speakerNotes: 'Ask for hands.', ...slide }] }));

  test('"layout": "quiz" is a discuss slide with its choices and its answer, not a deck that fails', () => {
    const slide = deckOf({ layout: 'quiz', question: 'What do the images share?', choices: ['Fragile', 'Decay', 'Nature'], answer: 2 })!.deck.slides[0]!;
    expect(slide).toMatchObject({ layout: 'discuss', question: 'What do the images share?', choices: ['Fragile', 'Decay', 'Nature'], answer: 2 });
    for (const layout of ['Quiz', 'multiple-choice', 'multiple_choice', 'mcq']) {
      expect(deckOf({ layout, question: 'Q?', choices: ['A1', 'B1'] })!.deck.slides[0]!.layout).toBe('discuss');
    }
  });

  test('a quiz slide with its question only in the title still has a question', () => {
    const slide = deckOf({ layout: 'quiz', title: 'Which fix is correct?', choices: ['A semicolon', 'A comma'] })!.deck.slides[0]!;
    expect(slide).toMatchObject({ layout: 'discuss', question: 'Which fix is correct?' });
  });

  test('options are choices; letters typed in front come off, since the slide draws its own', () => {
    const slide = deckOf({ layout: 'discuss', question: 'Q?', options: ['A) Fragile', 'b. Decay', '(C) Nature', 'D: Recovered'] })!.deck.slides[0]!;
    expect(slide.choices).toEqual(['Fragile', 'Decay', 'Nature', 'Recovered']);
    // A choice that only starts with a capital and a word is left alone.
    expect(deckOf({ layout: 'discuss', question: 'Q?', choices: ['A semicolon', 'A comma and "and"'] })!.deck.slides[0]!.choices).toEqual(['A semicolon', 'A comma and "and"']);
  });

  test('the answer as a letter, as the choice’s own words, or as a number in a string', () => {
    const answer = (value: unknown, key = 'answer') => deckOf({ layout: 'discuss', question: 'Q?', choices: ['Fragile', 'Decay', 'Nature'], [key]: value })!.deck.slides[0]!.answer;
    expect(answer('B')).toBe(2);
    expect(answer('c)')).toBe(3);
    expect(answer('Decay')).toBe(2);
    expect(answer('2')).toBe(2);
    expect(answer(3, 'correctAnswer')).toBe(3);
    expect(answer('B', 'correct')).toBe(2);
    // An answer that names no choice is left off: the question is still a question.
    expect(answer('Something else')).toBeUndefined();
    expect(answer(9)).toBeUndefined();
  });
});

describe('the exit slide never says a thing twice (the Leopard deck, Nov 21)', () => {
  const exitDeck = (slide: Record<string, unknown>) => ({
    title: 'Sicily and the Risorgimento',
    slides: [{ layout: 'exit', title: 'Before you go', body: 'Unification cost the Sicilian aristocracy ___.', speakerNotes: 'Close.', ...slide }],
  });

  test('a button the model wrote out in full keeps only what students open', () => {
    for (const button of ['Exit ticket: open it in Yawp!', 'Exit ticket: open it in Yawp! before you go', 'Exit ticket — open it in Yawp!', 'Exit ticket: Open it in Yawp! before you go.']) {
      const parsed = parseSlideDeck(fenced(exitDeck({ button })));
      expect(parsed?.deck?.slides[0]?.button).toBe('Exit ticket');
    }
  });

  test('a plain button is left alone', () => {
    expect(parseSlideDeck(fenced(exitDeck({ button: 'Exit ticket' })))?.deck?.slides[0]?.button).toBe('Exit ticket');
  });

  test('next lesson drops a "Next time:" or "Tomorrow:" the slide already supplies', () => {
    for (const nextLesson of ['Tomorrow: the man who wrote the novel', 'Next time: Tomorrow: the man who wrote the novel', 'Next time: the man who wrote the novel']) {
      const parsed = parseSlideDeck(fenced(exitDeck({ nextLesson })));
      expect(parsed?.deck?.slides[0]?.nextLesson).toBe('the man who wrote the novel');
    }
    expect(parseSlideDeck(fenced(exitDeck({ nextLesson: 'Lampedusa and his palace' })))?.deck?.slides[0]?.nextLesson).toBe('Lampedusa and his palace');
  });
});

describe('an excerpt slide without its passage (re-test, Nov 22)', () => {
  test('becomes a reading slide that says where the lines are; the deck is kept', () => {
    const json = JSON.stringify({
      title: 'Dulce',
      slides: [
        { layout: 'title', title: 'Dulce et Decorum Est', speakerNotes: 'n' },
        { layout: 'excerpt', title: 'Stanza 1', work: 'Dulce et Decorum Est', page: 'lines 1–8', bullets: ['Circle every simile.'], speakerNotes: 'n' },
      ],
    });
    const result = validateSlideDeck(json);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.deck.slides[1]!.layout).toBe('read');
  });
});

describe('a long page note is made short, not a lost deck (re-test, Nov 22)', () => {
  test.each([
    ['Act 1, Scene 3, lines 130–142', '1.3.130–142'],
    ['Chapter 1, pages 1–3', 'ch. 1, pp. 1–3'],
    ['Book 9, lines 105–566', '9.105–566'],
  ])('%s → %s', (long, short) => {
    expect(shortPage(long)).toBe(short);
  });
  test('the deck builds', () => {
    const json = JSON.stringify({ title: 'M', slides: [{ layout: 'title', title: 'Macbeth', speakerNotes: 'n' }, { layout: 'excerpt', title: 'The aside', body: 'Two truths are told', work: 'Macbeth', page: 'Act 1, Scene 3, lines 130–142', speakerNotes: 'n' }] });
    const result = validateSlideDeck(json);
    expect(result.ok).toBe(true);
  });
});

describe('the planner’s own seven-line agenda (re-test, Nov 22: Things Fall Apart lost its deck)', () => {
  test('is fitted to six lines, every part and minute kept; a numbered part is read as text', () => {
    const agenda = [5, 3, 15, 2, 12, 8, 5].map((minutes, i) => ({ title: `Part ${i + 1}`, minutes }));
    const json = JSON.stringify({
      title: 'TFA',
      slides: [
        { layout: 'title', title: 'Things Fall Apart', speakerNotes: 'n' },
        { layout: 'agenda', title: 'Today', agenda, speakerNotes: 'n' },
        { layout: 'big_idea', title: 'Idea', body: 'Achebe writes back.', part: 2, speakerNotes: 'n' },
      ],
    });
    const result = validateSlideDeck(json);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const lines = result.deck.slides[1]!.agenda!;
    expect(lines).toHaveLength(6);
    expect(lines.reduce((sum, line) => sum + (line.minutes ?? 0), 0)).toBe(50);
    expect(result.deck.slides[2]!.part).toBe('2');
  });
});

describe('a diagram of how a text is built (Nov 22)', () => {
  const n = { speakerNotes: 'n' };
  const deckOf = (...slides: unknown[]) => validateSlideDeck(JSON.stringify({ title: 'Sonnet 73', slides: [{ layout: 'title', title: 'Sonnet 73', ...n }, ...slides] }));
  const first = (...slides: unknown[]) => {
    const result = deckOf(...slides);
    if (!result.ok) throw new Error(result.reason);
    return result.deck.slides[1]!;
  };

  const SONNET = {
    layout: 'diagram',
    title: 'How Sonnet 73 is built',
    body: 'Where does the poem turn?',
    diagram: {
      kind: 'parts',
      items: [
        { label: 'Quatrain 1', text: 'Autumn: a few yellow leaves', note: 'lines 1–4', weight: 4 },
        { label: 'Quatrain 2', text: 'Twilight fading into night', note: 'lines 5–8', weight: 4 },
        { label: 'Quatrain 3', text: 'A fire dying on its ashes', note: 'lines 9–12', weight: 4 },
        { label: 'Couplet', text: 'So love what you must leave', note: 'lines 13–14', weight: 2 },
      ],
    },
    ...n,
  };
  const FRANKENSTEIN = {
    layout: 'diagram',
    title: 'A story inside a story',
    diagram: {
      kind: 'frames',
      items: [
        { label: 'Walton’s letters', text: 'A sea captain writes home to his sister.' },
        { label: 'Victor’s story', text: 'The man Walton rescues tells how he made a living being.' },
        { label: 'The creature’s story', text: 'At the centre, the creature tells Victor how he learned to speak.' },
      ],
    },
    ...n,
  };
  const YOUNGERS = {
    layout: 'diagram',
    title: 'The Youngers and the check',
    diagram: {
      kind: 'cast',
      items: [
        { label: 'Lena (Mama)', text: 'A house with a garden', note: 'Head of the family' },
        { label: 'Walter Lee', text: 'A liquor store of his own', note: 'Lena’s son' },
        { label: 'Beneatha', text: 'Medical school', note: 'Lena’s daughter' },
        { label: 'Ruth', text: 'A home that is theirs', note: 'Walter’s wife' },
      ],
    },
    ...n,
  };

  test('parts, frames and a cast are kept as written, weights and notes included', () => {
    const sonnet = first(SONNET);
    expect(sonnet.layout).toBe('diagram');
    expect(sonnet.body).toBe('Where does the poem turn?');
    expect(sonnet.diagram!.kind).toBe('parts');
    expect(sonnet.diagram!.items.map((item) => item.weight)).toEqual([4, 4, 4, 2]);
    expect(sonnet.diagram!.items[3]).toEqual({ label: 'Couplet', text: 'So love what you must leave', note: 'lines 13–14', weight: 2 });
    expect(first(FRANKENSTEIN).diagram).toMatchObject({ kind: 'frames', items: [{ label: 'Walton’s letters' }, { label: 'Victor’s story' }, { label: 'The creature’s story' }] });
    expect(first(YOUNGERS).diagram!.items[1]).toEqual({ label: 'Walter Lee', text: 'A liquor store of his own', note: 'Lena’s son' });
  });

  test('the items under their kind’s name, with the kind read from the name', () => {
    const cast = first({ layout: 'diagram', title: 'The Youngers', cast: YOUNGERS.diagram.items, ...n });
    expect(cast.diagram!.kind).toBe('cast');
    expect(cast.diagram!.items).toHaveLength(4);
    const frames = first({ layout: 'diagram', title: 'Frankenstein', diagram: { frames: FRANKENSTEIN.diagram.items }, ...n });
    expect(frames.diagram!.kind).toBe('frames');
    // Flat on the slide, where `items` would otherwise be taken for bullets.
    const flat = first({ layout: 'diagram', kind: 'parts', title: 'The speech', items: [{ label: 'To be' }, { label: 'To sleep' }, { label: 'To dream' }], ...n });
    expect(flat.diagram).toEqual({ kind: 'parts', items: [{ label: 'To be' }, { label: 'To sleep' }, { label: 'To dream' }] });
    expect(flat.bullets).toBeUndefined();
  });

  test('items written as "Label: text", a weight as "4 lines", names a model reaches for', () => {
    const slide = first({
      layout: 'diagram',
      title: 'Sonnet 73',
      parts: ['Quatrain 1: Autumn', '2. Quatrain 2 — Twilight', { name: 'Quatrain 3', description: 'A dying fire', weight: '4 lines' }, { title: 'Couplet', lines: 2 }],
      ...n,
    });
    expect(slide.diagram).toEqual({
      kind: 'parts',
      items: [{ label: 'Quatrain 1', text: 'Autumn' }, { label: 'Quatrain 2', text: 'Twilight' }, { label: 'Quatrain 3', text: 'A dying fire', weight: 4 }, { label: 'Couplet', weight: 2 }],
    });
  });

  test('a seventh item is cut and overlong words are shortened, never a lost deck', () => {
    const acts = ['Exposition', 'Rising action', 'Climax', 'Falling action', 'Resolution', 'Epilogue', 'Afterword'];
    const slide = first({ layout: 'diagram', title: 'The play', diagram: { kind: 'parts', items: [...acts.map((label) => ({ label })), { label: 'x'.repeat(60), text: 'y'.repeat(200) }] }, ...n });
    expect(slide.diagram!.items.map((item) => item.label)).toEqual(acts.slice(0, 6));
    const long = first({ layout: 'diagram', title: 'Long', diagram: { kind: 'cast', items: [{ label: 'x'.repeat(60), text: 'y'.repeat(200), note: 'z'.repeat(90) }, { label: 'Ruth' }] }, ...n });
    expect(long.diagram!.items[0]!.label).toHaveLength(40);
    expect(long.diagram!.items[0]!.text).toHaveLength(120);
    expect(long.diagram!.items[0]!.note).toHaveLength(60);
  });

  test('shares written as percentages keep their proportions', () => {
    const slide = first({ layout: 'diagram', title: 'The novel', parts: [{ label: 'Part 1', weight: 50 }, { label: 'Part 2', weight: 25 }, { label: 'Part 3', weight: 25 }], ...n });
    expect(slide.diagram!.items.map((item) => item.weight)).toEqual([40, 20, 20]);
  });

  test('no kind, or one Yawp! does not draw: parts when they have sizes, else cards', () => {
    expect(first({ layout: 'diagram', title: 'T', diagram: { kind: 'pyramid', items: [{ label: 'A', weight: 2 }, { label: 'B' }] }, ...n }).diagram!.kind).toBe('parts');
    expect(first({ layout: 'diagram', title: 'T', diagram: [{ label: 'A' }, { label: 'B' }], ...n }).diagram!.kind).toBe('cast');
  });

  test('a diagram with no title takes its kind’s', () => {
    expect(first({ layout: 'diagram', diagram: FRANKENSTEIN.diagram, ...n }).title).toBe('A story inside a story');
  });

  test('an unusable diagram becomes a list of its lines, and the deck still validates', () => {
    const one = first({ layout: 'diagram', title: 'The frame', diagram: { kind: 'frames', items: [{ label: 'Walton’s letters', text: 'A captain writes home.' }, { text: 'no name' }, 7] }, ...n });
    expect(one.layout).toBe('bullets');
    expect(one.bullets).toEqual(['Walton’s letters: A captain writes home.']);
    expect(one.diagram).toBeUndefined();
    // With no title either, the list still has a heading, so the deck is kept.
    expect(first({ layout: 'diagram', diagram: { kind: 'frames', items: ['Walton’s letters: A captain writes home.'] }, ...n })).toMatchObject({ layout: 'bullets', title: 'How it is built' });
    // Nothing in it at all: the slide is read by what else it holds.
    expect(first({ layout: 'diagram', title: 'The frame', diagram: 'frames', body: 'A story inside a story.', ...n }).layout).toBe('statement');
    expect(first({ layout: 'diagram', title: 'The frame', ...n }).layout).toBe('title');
    expect(first({ layout: 'diagram', title: 'The frame', diagram: { kind: 'cast', items: [] }, bullets: ['Walton', 'Victor'], ...n })).toMatchObject({ layout: 'bullets', bullets: ['Walton', 'Victor'] });
  });

  test('a broken diagram on another kind of slide is dropped, and the slide stays', () => {
    const slide = first({ layout: 'big_idea', title: 'Idea', body: 'Stories hold stories.', diagram: { kind: 'frames', items: 'three' }, ...n });
    expect(slide.layout).toBe('big_idea');
    expect(slide.diagram).toBeUndefined();
  });

  test('"cast" with people is still a person slide; with a cast, it is the diagram', () => {
    expect(first({ layout: 'cast', title: 'Who', people: [{ name: 'Lena', role: 'Mother' }], ...n }).layout).toBe('person');
    const cast = first({ layout: 'cast', title: 'Who', cast: [{ name: 'Lena', wants: 'A house', role: 'Mother' }, { name: 'Walter', wants: 'A store', role: 'Her son' }], ...n });
    expect(cast.layout).toBe('diagram');
    expect(cast.diagram).toEqual({ kind: 'cast', items: [{ label: 'Lena', text: 'A house', note: 'Mother' }, { label: 'Walter', text: 'A store', note: 'Her son' }] });
  });

  test('older looks draw it as a list', () => {
    const classic = classicSlide(first(SONNET));
    expect(classic.layout).toBe('bullets');
    expect(classic.bullets).toEqual(['Quatrain 1: Autumn: a few yellow leaves', 'Quatrain 2: Twilight fading into night', 'Quatrain 3: A fire dying on its ashes', 'Couplet: So love what you must leave']);
    expect(diagramLines(first(FRANKENSTEIN))[0]).toBe('Walton’s letters: A sea captain writes home to his sister.');
  });
});

describe('the phrases an excerpt slide marks (Nov 22)', () => {
  const excerpt = (highlight: unknown) => {
    const result = validateSlideDeck(
      JSON.stringify({
        title: 'Sonnet 73',
        slides: [{ layout: 'excerpt', title: 'Annotate', body: 'That time of year thou mayst in me behold\nWhen yellow leaves, or none, or few, do hang', highlight, speakerNotes: 'n' }],
      })
    );
    if (!result.ok) throw new Error(result.reason);
    return result.deck.slides[0]!;
  };

  test('a list of phrases is kept in order', () => {
    expect(excerpt(['That time of year', 'yellow leaves']).highlight).toEqual(['That time of year', 'yellow leaves']);
  });

  test('one phrase written alone is a list of one; empties are dropped', () => {
    expect(excerpt('yellow leaves').highlight).toEqual(['yellow leaves']);
    expect(excerpt(['', '  ', 'yellow leaves', 'x', null]).highlight).toEqual(['yellow leaves']);
    expect(excerpt([]).highlight).toBeUndefined();
    expect(excerpt('').highlight).toBeUndefined();
  });

  test('a fifth phrase is cut and a very long one shortened at a word, never a lost deck', () => {
    expect(excerpt(['aa', 'bb', 'cc', 'dd', 'ee']).highlight).toEqual(['aa', 'bb', 'cc', 'dd']);
    const long = excerpt([Array(30).fill('leaves').join(' ')]).highlight![0]!;
    expect(long.length).toBeLessThanOrEqual(80);
    expect(long.endsWith('leaves')).toBe(true);
  });

  test('`highlights` is read as `highlight`', () => {
    const result = validateSlideDeck(JSON.stringify({ title: 'S', slides: [{ layout: 'excerpt', title: 'A', body: 'Bare ruined choirs', highlights: ['ruined choirs'], speakerNotes: 'n' }] }));
    expect(result.ok && result.deck.slides[0]!.highlight).toEqual(['ruined choirs']);
  });
});
