import { describe, expect, test } from 'bun:test';
import {
  inlineLessonResources,
  readLessonResources,
  verifyLessonResources,
} from './lesson-resource';

const DECK = [
  '```yawp-resource',
  'title: Body Paragraphs Slide Deck',
  'href: /api/teacher-training-module-resource/r1',
  'kind: slides',
  'Project slides 4–9. Stop before the thesis slides.',
  '```',
].join('\n');

describe('readLessonResources', () => {
  test('brings the material into the lesson with what to do with it', () => {
    const { resources, body } = readLessonResources(
      `## Mini-lesson\n\n${DECK}\n\nThen model one together.`
    );
    expect(resources).toEqual([
      {
        title: 'Body Paragraphs Slide Deck',
        href: '/api/teacher-training-module-resource/r1',
        kind: 'slides',
        note: 'Project slides 4–9. Stop before the thesis slides.',
      },
    ]);
    expect(body).toBe('## Mini-lesson\n\nThen model one together.');
  });

  test('accepts url as a spelling of href', () => {
    const { resources } = readLessonResources(
      '```yawp-resource\ntitle: Deck\nurl: https://docs.google.com/d\n```'
    );
    expect(resources[0]!.href).toBe('https://docs.google.com/d');
  });

  test('falls back to a neutral kind rather than refusing the material', () => {
    const { resources } = readLessonResources(
      '```yawp-resource\ntitle: Handout\nhref: /x\nkind: pamphlet\n```'
    );
    expect(resources[0]!.kind).toBe('document');
  });

  test('drops a block that names nothing or points nowhere', () => {
    expect(
      readLessonResources('```yawp-resource\nhref: /x\n```').resources
    ).toEqual([]);
    expect(
      readLessonResources('```yawp-resource\ntitle: Deck\n```').resources
    ).toEqual([]);
  });

  test('works with no note at all', () => {
    const { resources } = readLessonResources(
      '```yawp-resource\ntitle: Deck\nhref: /x\n```'
    );
    expect(resources[0]!.note).toBe('');
  });

  test('leaves a reply with no material completely alone', () => {
    const reply = '## Warm-up\n\nFour minutes of writing.';
    expect(readLessonResources(reply).body).toBe(reply);
  });
});

describe('verifyLessonResources', () => {
  test('keeps material the catalog actually returned', () => {
    const { reply, removed } = verifyLessonResources(DECK, [
      '/api/teacher-training-module-resource/r1',
    ]);
    expect(reply).toBe(DECK);
    expect(removed).toEqual([]);
  });

  test('removes a card promising material that does not exist', () => {
    // A card is a much louder promise than a sentence, so an invented address
    // has to go before the teacher ever sees it.
    const { reply, removed } = verifyLessonResources(
      `## Mini-lesson\n\n${DECK}\n\nThen model one.`,
      ['/api/teacher-training-module-resource/somethingelse']
    );
    expect(reply).toBe('## Mini-lesson\n\nThen model one.');
    expect(removed).toEqual(['/api/teacher-training-module-resource/r1']);
  });

  test('does not care about a query string', () => {
    const withQuery = DECK.replace('/r1', '/r1?download=1');
    expect(
      verifyLessonResources(withQuery, [
        '/api/teacher-training-module-resource/r1',
      ]).removed
    ).toEqual([]);
  });

  test('leaves a reply with no blocks untouched', () => {
    const reply = '## Warm-up\n\nWrite.';
    expect(verifyLessonResources(reply, []).reply).toBe(reply);
  });
});

describe('inlineLessonResources', () => {
  test('prints the material as a named link for the packet', () => {
    expect(inlineLessonResources(DECK)).toBe(
      '**[Body Paragraphs Slide Deck](/api/teacher-training-module-resource/r1)**' +
        ' — Project slides 4–9. Stop before the thesis slides.'
    );
  });

  test('prints the name alone when there is no note', () => {
    expect(
      inlineLessonResources('```yawp-resource\ntitle: Deck\nhref: /x\n```')
    ).toBe('**[Deck](/x)**');
  });
});
