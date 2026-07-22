import { describe, expect, test } from 'bun:test';
import {
  assignmentAiContextHash,
  buildAssignmentAiContextSnapshot,
  parseAssignmentAiContextSnapshot,
} from './assignment-ai-context';

describe('assignment AI context snapshots', () => {
  test('freezes the trusted assignment prompt, rubric, grading version, and prompt config', () => {
    const snapshot = buildAssignmentAiContextSnapshot({
      assignmentTypeId: 'type-1',
      assignmentPrompt: 'Explain how the evidence supports the claim.',
      gradingVersion: 4,
      rubricSnapshot: {
        categories: [
          {
            key: 'evidence',
            label: 'Evidence',
            weight: 1,
            description: 'Connects relevant evidence to the claim.',
          },
        ],
        minScore: 1,
        maxScore: 5,
        scoringType: 'weighted_1_5',
      },
      promptConfigSnapshot: {
        gradingInstructions: 'Score the submitted response only.',
      },
      outputSchemaSnapshot: { schemaVersion: 1 },
    });

    expect(snapshot.schemaVersion).toBe(1);
    expect(snapshot.assignmentPrompt).toContain('evidence supports');
    expect(snapshot.assignmentTypeGradingVersion).toBe(4);
    expect(snapshot.rubricHash).toHaveLength(64);
    expect(snapshot.contextHash).toBe(assignmentAiContextHash(snapshot));
    expect(parseAssignmentAiContextSnapshot(snapshot)).toEqual(snapshot);
  });

  test('hashes semantically identical object keys deterministically', () => {
    const left = buildAssignmentAiContextSnapshot({
      assignmentTypeId: 'type-1',
      assignmentPrompt: 'Prompt',
      gradingVersion: 1,
      rubricSnapshot: { maxScore: 5, minScore: 1, categories: [] },
      promptConfigSnapshot: { b: 2, a: 1 },
      outputSchemaSnapshot: {},
    });
    const right = buildAssignmentAiContextSnapshot({
      assignmentTypeId: 'type-1',
      assignmentPrompt: 'Prompt',
      gradingVersion: 1,
      rubricSnapshot: { categories: [], minScore: 1, maxScore: 5 },
      promptConfigSnapshot: { a: 1, b: 2 },
      outputSchemaSnapshot: {},
    });

    expect(left.contextHash).toBe(right.contextHash);
    expect(left.rubricHash).toBe(right.rubricHash);
  });

  test('rejects malformed and cross-assignment snapshots', () => {
    expect(parseAssignmentAiContextSnapshot({ schemaVersion: 1 })).toBeNull();
    const snapshot = buildAssignmentAiContextSnapshot({
      assignmentTypeId: 'type-1',
      assignmentPrompt: 'Prompt',
      gradingVersion: 1,
      rubricSnapshot: { categories: [] },
      promptConfigSnapshot: {},
      outputSchemaSnapshot: {},
    });
    expect(
      parseAssignmentAiContextSnapshot(snapshot, {
        assignmentTypeId: 'type-2',
      })
    ).toBeNull();
  });
});
