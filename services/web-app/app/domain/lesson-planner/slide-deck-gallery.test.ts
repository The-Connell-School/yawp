import { describe, expect, test } from 'bun:test';
import { classicSlide, validateSlideDeck, type Slide } from './slide-deck';

function deck(slides: unknown[], extra: Record<string, unknown> = {}) {
  return JSON.stringify({ title: 'Carrying', ...extra, slides });
}

const notes = { speakerNotes: 'Say it.' };

describe('gallery slides validate', () => {
  test('every gallery template with its own slots', () => {
    const result = validateSlideDeck(
      deck(
        [
          { layout: 'agenda', title: 'Today', agenda: [{ title: 'Daily Pages', minutes: '10' }], ...notes },
          { layout: 'discuss', title: 'Talk', question: 'What do they carry?', grouping: 'Pairs', ...notes },
          { layout: 'big_idea', title: 'Hold this', body: 'Weight is a story.', ...notes },
          { layout: 'write', title: 'Write', body: 'Name one thing you carry.', seconds: 300, ...notes },
          { layout: 'notes', title: 'Know', timeline: [{ year: '1968', caption: 'Tet' }], ...notes },
          { layout: 'divider', title: 'The war at home', part: 'iv', ...notes },
          { layout: 'read', title: 'Read', tasks: [{ verb: 'Underline', text: 'every weight' }], ...notes },
          { layout: 'look', title: 'Look', question: 'What is left behind?', ...notes },
          { layout: 'excerpt', title: 'Annotate', body: 'They carried all they could bear.', author: "Tim O'Brien", ...notes },
          { layout: 'exit', title: 'Before you go', body: 'One sentence.', nextLesson: 'Love', ...notes },
        ],
        { unit: 'The Things They Carried', accent: 'ember', art: 'turner-temeraire' }
      )
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.deck.accent).toBe('ember');
    expect(result.deck.slides[0]!.agenda![0]!.minutes).toBe(10);
  });

  test('a gallery template without its slot is refused by name', () => {
    const result = validateSlideDeck(deck([{ layout: 'agenda', title: 'Today', ...notes }]));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain('agenda');
  });

  test('an unknown accent is refused', () => {
    const result = validateSlideDeck(deck([{ layout: 'title', title: 'Hi', ...notes }], { accent: 'neon' }));
    expect(result.ok).toBe(false);
  });

  test('aliases a model reaches for land on the gallery templates', () => {
    const result = validateSlideDeck(
      deck([
        { layout: 'Read-Along', title: 'Read', bullets: ['Underline weights'], ...notes },
        { layout: 'timeline', title: 'Know', facts: ['Drafted at 21'], ...notes },
        { layout: 'bigidea', title: 'Hold', body: 'Weight.', ...notes },
      ])
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.deck.slides.map((slide) => slide.layout)).toEqual(['read', 'notes', 'big_idea']);
  });

  test('a classic deck is unchanged', () => {
    const result = validateSlideDeck(
      deck([{ layout: 'exit ticket', title: 'Before you go', body: 'One line.', ...notes }])
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.deck.slides[0]!.layout).toBe('closing');
  });
});

describe('classicSlide: a gallery slide on a classic renderer', () => {
  const base = { title: 'T', speakerNotes: 'n' };

  test('classic slides pass through untouched', () => {
    const slide: Slide = { ...base, layout: 'bullets', bullets: ['a'] };
    expect(classicSlide(slide)).toBe(slide as any);
  });

  test('agenda reads as bullets with minutes', () => {
    const slide = classicSlide({ ...base, layout: 'agenda', agenda: [{ title: 'Hook', minutes: 15 }, { title: 'Read' }] });
    expect(slide.layout).toBe('bullets');
    expect(slide.bullets).toEqual(['Hook (15 min)', 'Read']);
  });

  test('discuss and look are prompts on their question', () => {
    expect(classicSlide({ ...base, layout: 'discuss', question: 'Why?' })).toMatchObject({ layout: 'prompt', body: 'Why?' });
    expect(classicSlide({ ...base, layout: 'look', body: 'See it.' })).toMatchObject({ layout: 'prompt', body: 'See it.' });
  });

  test('the rest map to their nearest classic layout', () => {
    expect(classicSlide({ ...base, layout: 'big_idea', body: 'x' }).layout).toBe('statement');
    expect(classicSlide({ ...base, layout: 'write', body: 'x' }).layout).toBe('prompt');
    expect(classicSlide({ ...base, layout: 'divider' }).layout).toBe('title');
    expect(classicSlide({ ...base, layout: 'exit', body: 'x' }).layout).toBe('closing');
    expect(classicSlide({ ...base, layout: 'excerpt', body: 'x', author: 'Ann' })).toMatchObject({
      layout: 'quote',
      attribution: 'Ann',
    });
  });

  test('notes and read become bullets', () => {
    expect(
      classicSlide({ ...base, layout: 'notes', timeline: [{ year: '1968', caption: 'Tet' }], facts: ['Drafted'] }).bullets
    ).toEqual(['1968: Tet', 'Drafted']);
    expect(classicSlide({ ...base, layout: 'read', tasks: [{ verb: 'Circle', text: 'names' }] }).bullets).toEqual([
      'Circle names',
    ]);
  });
});

describe('Deck spec v3 slots', () => {
  const n = { speakerNotes: 'Say it.' };

  test('a deck carries its painting’s colors; slides their step, quiz, button and color pick', () => {
    const result = validateSlideDeck(
      JSON.stringify({
        title: 'Conclusion Paragraph',
        colors: ['#9C4A22', '#3F5A73', '#7D6118'],
        slides: [
          { layout: 'title', title: 'Conclusion Paragraph', course: 'English 9', ...n },
          { layout: 'divider', title: 'We write.', processStep: 5, ...n },
          { layout: 'discuss', title: 'Quiz', question: 'Which move comes first?', choices: ['Restate', 'Widen', 'Close'], answer: 1, color: 2, ...n },
          { layout: 'exit', title: 'Before you go', body: 'One line.', button: 'Exit ticket', ...n },
        ],
      })
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.deck.colors).toEqual(['#9C4A22', '#3F5A73', '#7D6118']);
    expect(result.deck.slides[1]!.processStep).toBe(5);
    expect(result.deck.slides[2]).toMatchObject({ choices: ['Restate', 'Widen', 'Close'], answer: 1, color: 2 });
    expect(result.deck.slides[3]!.button).toBe('Exit ticket');
  });

  test('a writing-process step outside 1 to 6, or a fourth deck color, is refused', () => {
    expect(validateSlideDeck(JSON.stringify({ title: 'X', slides: [{ layout: 'divider', title: 'We write.', processStep: 7, ...n }] })).ok).toBe(false);
    expect(validateSlideDeck(JSON.stringify({ title: 'X', colors: ['#111111', '#222222', '#333333', '#444444'], slides: [{ layout: 'title', title: 'X', ...n }] })).ok).toBe(false);
  });
});
