import { describe, expect, test } from 'bun:test';
import {
  parseGrammarIssuesPayload,
  sortGrammarIssuesByDocumentOrder,
  type GrammarIssue,
} from './grammarIssues';

describe('parseGrammarIssuesPayload', () => {
  test('filters out issues whose excerpt does not exist in sourceText', () => {
    const sourceText = 'The student wrote a clear essay.';
    const raw = {
      issues: [
        {
          excerpt: 'text that does not exist in the document',
          kind: 'error',
          message: 'This phrase needs improvement.',
        },
      ],
    };

    const result = parseGrammarIssuesPayload(raw, { sourceText });

    expect(result).toHaveLength(0);
  });

  test('includes issues whose excerpt exists in sourceText', () => {
    const sourceText = 'The student wrote a clear essay.';
    const raw = {
      issues: [
        {
          excerpt: 'clear essay',
          kind: 'style',
          message: 'Consider a stronger adjective.',
        },
      ],
    };

    const result = parseGrammarIssuesPayload(raw, { sourceText });

    expect(result).toHaveLength(1);
    expect(result[0].excerpt).toBe('clear essay');
  });

  test('filters hallucinated issues while keeping valid ones', () => {
    const sourceText = 'The dog ran fast. The cat slept.';
    const raw = {
      issues: [
        {
          excerpt: 'The dog ran fast',
          kind: 'error',
          message: 'Add a comma.',
        },
        {
          excerpt: 'hallucinated phrase nowhere in document',
          kind: 'error',
          message: 'Fix this.',
        },
      ],
    };

    const result = parseGrammarIssuesPayload(raw, { sourceText });

    expect(result).toHaveLength(1);
    expect(result[0].excerpt).toBe('The dog ran fast');
  });
});

describe('sortGrammarIssuesByDocumentOrder', () => {
  const issue = (
    id: string,
    excerpt: string,
    occurrence = 1
  ): GrammarIssue => ({
    id,
    excerpt,
    occurrence,
    kind: 'error',
    message: id,
  });

  test('sorts issues by the location of their matching excerpt', () => {
    const sourceText = 'First note. Middle note. Last note.';

    const result = sortGrammarIssuesByDocumentOrder(
      [
        issue('last', 'Last note'),
        issue('first', 'First note'),
        issue('middle', 'Middle note'),
      ],
      sourceText
    );

    expect(result.map(({ id }) => id)).toEqual(['first', 'middle', 'last']);
  });

  test('uses occurrence to place repeated excerpts and keeps unmatched items last', () => {
    const sourceText = 'Repeat here. Something else. Repeat here.';

    const result = sortGrammarIssuesByDocumentOrder(
      [
        issue('unmatched', 'Missing text'),
        issue('second-repeat', 'Repeat here', 2),
        issue('first-repeat', 'Repeat here', 1),
      ],
      sourceText
    );

    expect(result.map(({ id }) => id)).toEqual([
      'first-repeat',
      'second-repeat',
      'unmatched',
    ]);
  });
});
