import { describe, expect, test } from 'bun:test';
import { formatShortFormOptionTags } from './short-form-prompt-generator';

describe('formatShortFormOptionTags', () => {
  test('reads a draft the way a short-form library row does', () => {
    expect(
      formatShortFormOptionTags({
        prompt: 'Defend your reading with one line from the text.',
        kind: 'close-read',
        sourceNeed: 'required',
        lengthTarget: 'paragraph',
        cognitiveMoves: ['interpret'],
      })
    ).toEqual([
      'Close-read a passage',
      'Source required',
      'One paragraph',
      'Interpret',
    ]);
  });
});
