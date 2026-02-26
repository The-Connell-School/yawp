import { describe, expect, test } from 'bun:test';
import { resolveGradeEssayContent } from './grade-essay-content';

describe('resolveGradeEssayContent', () => {
  test('prefers frozen grade essay content when present', () => {
    expect(
      resolveGradeEssayContent({
        essayText: 'Frozen text',
        essayHtml: '<p>Frozen text</p>',
        snapshot: {
          text: 'Snapshot text',
          html: '<p>Snapshot text</p>',
        },
      })
    ).toEqual({
      essayText: 'Frozen text',
      essayHtml: '<p>Frozen text</p>',
    });
  });

  test('falls back to snapshot content when frozen fields are missing', () => {
    expect(
      resolveGradeEssayContent({
        essayText: null,
        essayHtml: undefined,
        snapshot: {
          text: 'Snapshot text',
          html: '<p>Snapshot text</p>',
        },
      })
    ).toEqual({
      essayText: 'Snapshot text',
      essayHtml: '<p>Snapshot text</p>',
    });
  });
});
