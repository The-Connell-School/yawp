import { describe, expect, test } from 'bun:test';
import {
  boundedSeedHistory,
  deriveSeedConversationTitle,
  validateNewGraphReferences,
} from './seed-generator-conversation.server';

describe('seed generator conversation helpers', () => {
  test('bounds history by newest message count and total characters', () => {
    const messages = Array.from({ length: 25 }, (_, index) => ({
      role: index % 2 ? 'assistant' : 'user',
      content: `${index}`.padEnd(2_000, 'x'),
    }));
    const history = boundedSeedHistory(messages);

    expect(history.length).toBeLessThanOrEqual(20);
    expect(
      history.reduce((sum, item) => sum + item.content.length, 0)
    ).toBeLessThanOrEqual(24_000);
    expect(history.at(-1)?.content.startsWith('24')).toBe(true);
  });

  test('derives a compact thread title from the first message', () => {
    expect(deriveSeedConversationTitle('  Add   two students  ')).toBe(
      'Add two students'
    );
    expect(
      deriveSeedConversationTitle('x'.repeat(100)).length
    ).toBeLessThanOrEqual(60);
  });

  test('accepts new nodes that reference the current durable graph', () => {
    const result = validateNewGraphReferences(
      {
        nodes: [
          {
            localId: 'document-2',
            kind: 'document',
            parentLocalId: 'assignment-1',
            data: { title: 'Second essay', studentLocalId: 'student-1' },
          },
          {
            localId: 'submission-2',
            kind: 'submission',
            parentLocalId: 'document-2',
            data: { status: 'submitted' },
          },
        ],
      },
      [
        {
          localId: 'assignment-1',
          kind: 'assignment',
          parentLocalId: 'class-1',
          status: 'committed',
          committedEntityId: 'assignment-real-1',
          data: {},
        },
        {
          localId: 'student-1',
          kind: 'student',
          parentLocalId: 'class-1',
          status: 'committed',
          committedEntityId: 'membership-real-1',
          data: {},
        },
      ],
      new Set()
    );
    expect(result).toEqual({ valid: true });
  });

  test('rejects duplicate ids and invalid relationship kinds', () => {
    const result = validateNewGraphReferences(
      {
        nodes: [
          {
            localId: 'student-1',
            kind: 'document',
            parentLocalId: 'student-1',
            data: { title: 'Bad edge', studentLocalId: 'student-1' },
          },
        ],
      },
      [
        {
          localId: 'student-1',
          kind: 'student',
          parentLocalId: 'class-1',
          status: 'proposed',
          committedEntityId: null,
          data: {},
        },
      ],
      new Set()
    );
    expect(result.valid).toBe(false);
  });

  test('requires a fresh document for follow-up generated writing', () => {
    const result = validateNewGraphReferences(
      {
        nodes: [
          {
            localId: 'submission-2',
            kind: 'submission',
            parentLocalId: 'document-1',
            data: { status: 'submitted' },
          },
        ],
      },
      [
        {
          localId: 'document-1',
          kind: 'document',
          parentLocalId: 'assignment-1',
          status: 'committed',
          committedEntityId: 'document-real-1',
          data: { title: 'First essay', studentLocalId: 'student-1' },
        },
      ],
      new Set()
    );

    expect(result.valid).toBe(false);
    if (!result.valid)
      expect(result.issues.join(' ')).toMatch(/fresh document/);
  });
});
