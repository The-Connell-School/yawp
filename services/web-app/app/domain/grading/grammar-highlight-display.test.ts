import { describe, expect, test } from 'bun:test';
import {
  grammarHighlightCaption,
  grammarHighlightGrammarTabLabel,
} from './grammar-highlight-display';

describe('grammar-highlight-display', () => {
  test('default labels stay unchanged when display is not explicit', () => {
    expect(grammarHighlightGrammarTabLabel('deduct', false)).toBe('Grammar');
    expect(grammarHighlightCaption('deduct', false)).toBeNull();
    expect(grammarHighlightCaption('highlight', false)).toBeNull();
  });

  test('explicit highlight and deduct modes get distinct copy', () => {
    expect(grammarHighlightGrammarTabLabel('highlight', true)).toBe(
      'Grammar (marked only)'
    );
    expect(grammarHighlightGrammarTabLabel('deduct', true)).toBe(
      'Grammar (affects grade)'
    );
    expect(grammarHighlightCaption('highlight', true)).toContain(
      "doesn't lower the grade"
    );
    expect(grammarHighlightCaption('deduct', true)).toContain('may lower');
  });
});
