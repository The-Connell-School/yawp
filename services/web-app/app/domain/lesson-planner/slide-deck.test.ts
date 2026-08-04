import { describe, expect, test } from 'bun:test';
import {
  deckDurationMinutes,
  parseSlideDeck,
  slideSearchText,
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
