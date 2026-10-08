import { describe, expect, test } from 'bun:test';
import { collectToolLinks, verifyLessonLinks } from './lesson-links';

describe('collectToolLinks', () => {
  test('finds links at every depth of a tool result', () => {
    const result = JSON.stringify({
      trainings: [
        {
          title: 'Body Paragraphs',
          href: '/app/teacher-trainings/t1',
          modules: [
            {
              href: '/app/teacher-trainings/t1/modules/m1',
              materials: [
                { name: 'Deck', href: '/api/teacher-training-resource/r1' },
              ],
            },
          ],
          links: [{ title: 'Slides', url: 'https://docs.google.com/deck' }],
        },
      ],
    });

    expect(collectToolLinks(result).sort()).toEqual([
      '/api/teacher-training-resource/r1',
      '/app/teacher-trainings/t1',
      '/app/teacher-trainings/t1/modules/m1',
      'https://docs.google.com/deck',
    ]);
  });

  test('picks up a link named something other than href', () => {
    expect(
      collectToolLinks(JSON.stringify({ libraryHref: '/app/assignment-types' }))
    ).toEqual(['/app/assignment-types']);
  });

  test('ignores fields that merely contain a URL-ish word', () => {
    expect(
      collectToolLinks(
        JSON.stringify({ urlencoded: 'no', description: '/app/nope' })
      )
    ).toEqual([]);
  });

  test('trusts nothing from a result it cannot parse', () => {
    expect(collectToolLinks('not json {')).toEqual([]);
  });
});

describe('verifyLessonLinks', () => {
  test('keeps a link the catalog actually returned', () => {
    const reply = 'Project [the deck](/app/teacher-trainings/t1) for this.';
    const { reply: checked, removed } = verifyLessonLinks(reply, [
      '/app/teacher-trainings/t1',
    ]);
    expect(checked).toBe(reply);
    expect(removed).toEqual([]);
  });

  test('takes the href off a link no tool ever returned', () => {
    // Straight from a real plan: a Lounge deck and a handout that sound real
    // and go nowhere.
    const { reply, removed } = verifyLessonLinks(
      'Use [Body Paragraphs Slide Deck](/app/lounge/body-paragraphs) — project this.\n' +
        'Hand out [Citing & Integrating Quotations handout](/app/resources/citing).',
      ['/app/teacher-trainings/t1']
    );

    expect(reply).toBe(
      'Use Body Paragraphs Slide Deck — project this.\n' +
        'Hand out Citing & Integrating Quotations handout.'
    );
    expect(removed).toEqual([
      '/app/lounge/body-paragraphs',
      '/app/resources/citing',
    ]);
  });

  test('leaves the words alone, including their emphasis', () => {
    const { reply } = verifyLessonLinks('See [**the deck**](/made/up).', []);
    expect(reply).toBe('See **the deck**.');
  });

  test('does not care about a query string or a fragment', () => {
    const reply = 'Open [module 2](/app/teacher-trainings/t1?tab=modules#m2).';
    expect(verifyLessonLinks(reply, ['/app/teacher-trainings/t1']).reply).toBe(
      reply
    );
  });

  test('leaves an in-page anchor alone', () => {
    const reply = 'Jump to [the warm-up](#warm-up).';
    expect(verifyLessonLinks(reply, []).reply).toBe(reply);
  });

  test('leaves a mailto alone', () => {
    const reply = 'Email [the department](mailto:english@school.edu).';
    expect(verifyLessonLinks(reply, []).reply).toBe(reply);
  });

  test('strips an external link the catalog never mentioned', () => {
    const { reply } = verifyLessonLinks(
      'Watch [this video](https://youtube.com/watch?v=made-up).',
      []
    );
    expect(reply).toBe('Watch this video.');
  });

  test('keeps an external link the catalog did return', () => {
    const reply = 'Open [the slides](https://docs.google.com/deck).';
    expect(
      verifyLessonLinks(reply, ['https://docs.google.com/deck']).reply
    ).toBe(reply);
  });

  test('leaves a reply with no links untouched', () => {
    const reply = '## Warm-up\n\nFour minutes of writing.';
    expect(verifyLessonLinks(reply, []).reply).toBe(reply);
  });
});
