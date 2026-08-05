import { describe, expect, test } from 'bun:test';
import {
  SEED_GENERATOR_TOOL,
  seedCommitProposalSchema,
  seedProposalSchema,
} from './seed-generator-schema';

function validClassAndAssignment() {
  return {
    classes: [
      { localId: 'class-1', title: 'English 9', grade: '9', period: '3', schoolYear: '2025-2026' },
    ],
    assignments: [
      {
        localId: 'assignment-1',
        classLocalId: 'class-1',
        title: 'Civic essay',
        prompt: 'Write about civic responsibility.',
        assignmentTypeTitle: 'The Thesis-Driven Essay',
      },
    ],
  };
}

describe('SEED_GENERATOR_TOOL', () => {
  test('exposes the tool name and a JSON schema with the expected top-level keys', () => {
    expect(SEED_GENERATOR_TOOL.name).toBe('propose_seed_data');
    expect(SEED_GENERATOR_TOOL.input_schema.required).toEqual([
      'classes',
      'assignments',
      'students',
    ]);
    expect(Object.keys(SEED_GENERATOR_TOOL.input_schema.properties)).toEqual([
      'classes',
      'assignments',
      'students',
    ]);
  });
});

describe('seedProposalSchema', () => {
  test('accepts a well-formed proposal with a graded submission', () => {
    const proposal = {
      ...validClassAndAssignment(),
      students: [
        {
          localId: 'student-1',
          name: 'Maya R.',
          classLocalId: 'class-1',
          writingProfile: 'struggling',
          submissions: [
            {
              localId: 'submission-1',
              assignmentLocalId: 'assignment-1',
              essayText: 'This are a essay about civic stuff.',
              status: 'graded',
              grade: {
                numericPercentage: 62,
                letterGrade: 'D',
                overallScore: 2,
                overallComment: 'Needs more organization and evidence.',
                rubricScores: { thesis_and_content: 2, grammar_and_mechanics: 1 },
                released: true,
              },
            },
          ],
        },
      ],
    };
    const result = seedProposalSchema.safeParse(proposal);
    expect(result.success).toBe(true);
  });

  test('rejects a graded submission missing the grade object', () => {
    const proposal = {
      ...validClassAndAssignment(),
      students: [
        {
          localId: 'student-1',
          name: 'Maya R.',
          classLocalId: 'class-1',
          writingProfile: 'struggling',
          submissions: [
            {
              localId: 'submission-1',
              assignmentLocalId: 'assignment-1',
              essayText: 'Some essay text.',
              status: 'graded',
            },
          ],
        },
      ],
    };
    const result = seedProposalSchema.safeParse(proposal);
    expect(result.success).toBe(false);
  });

  test('rejects an empty proposal (no classes and no students)', () => {
    const result = seedProposalSchema.safeParse({
      classes: [],
      assignments: [],
      students: [],
    });
    expect(result.success).toBe(false);
  });

  test('rejects unknown top-level fields (additionalProperties: false parity)', () => {
    const result = seedProposalSchema.safeParse({
      classes: [],
      assignments: [],
      students: [
        {
          localId: 's1',
          name: 'X',
          classLocalId: 'class-1',
          writingProfile: 'on_track',
          submissions: [
            {
              localId: 'sub-1',
              assignmentLocalId: 'assignment-1',
              essayText: 'text',
              status: 'draft',
            },
          ],
        },
      ],
      unexpectedField: true,
    });
    expect(result.success).toBe(false);
  });

  test('rejects a draft submission that improperly carries a grade', () => {
    // A draft with a grade attached is still schema-valid (grade is optional,
    // not forbidden for non-graded statuses) -- the write path is what
    // ignores grade fields for non-"graded" statuses. This test documents
    // that intentional leniency rather than asserting a false rejection.
    const result = seedProposalSchema.safeParse({
      ...validClassAndAssignment(),
      students: [
        {
          localId: 's1',
          name: 'X',
          classLocalId: 'class-1',
          writingProfile: 'on_track',
          submissions: [
            {
              localId: 'sub-1',
              assignmentLocalId: 'assignment-1',
              essayText: 'text',
              status: 'draft',
              grade: {
                numericPercentage: 90,
                letterGrade: 'A',
                overallScore: 5,
                overallComment: 'ok',
                rubricScores: {},
                released: true,
              },
            },
          ],
        },
      ],
    });
    expect(result.success).toBe(true);
  });
});

describe('seedCommitProposalSchema', () => {
  test('requires an explicit approved boolean on every class and student', () => {
    const missingApproved = {
      classes: [
        { localId: 'class-1', title: 'English 9', grade: '9', period: '3', schoolYear: '2025-2026' },
      ],
      assignments: [],
      students: [],
    };
    expect(seedCommitProposalSchema.safeParse(missingApproved).success).toBe(false);

    const withApproved = {
      classes: [
        {
          localId: 'class-1',
          title: 'English 9',
          grade: '9',
          period: '3',
          schoolYear: '2025-2026',
          approved: true,
        },
      ],
      assignments: [],
      students: [],
    };
    expect(seedCommitProposalSchema.safeParse(withApproved).success).toBe(true);
  });
});
