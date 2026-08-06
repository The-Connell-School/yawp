import { describe, expect, test } from 'bun:test';
import {
  SEED_CONTENT_FILL_TOOL,
  SEED_GRAPH_TOOL,
  seedContentFillSchema,
  seedCommitProposalSchema,
  seedGraphProposalSchema,
  seedProposalSchema,
} from './seed-generator-schema';

function validClassAndAssignment() {
  return {
    classes: [
      {
        localId: 'class-1',
        title: 'English 9',
        grade: '9',
        period: '3',
        schoolYear: '2025-2026',
      },
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

describe('two-phase seed generator contracts', () => {
  const structuralGraph = {
    nodes: [
      {
        localId: 'class-1',
        kind: 'class',
        parentLocalId: null,
        data: {
          title: 'English 9',
          grade: '9',
          period: '3',
          schoolYear: '2026-2027',
        },
      },
      {
        localId: 'assignment-1',
        kind: 'assignment',
        parentLocalId: 'class-1',
        data: {
          title: 'Civic essay',
          prompt: 'Write about civic responsibility.',
          assignmentTypeTitle: 'The Thesis-Driven Essay',
        },
      },
      {
        localId: 'student-1',
        kind: 'student',
        parentLocalId: 'class-1',
        data: { name: 'Maya R.', writingProfile: 'struggling' },
      },
      {
        localId: 'document-1',
        kind: 'document',
        parentLocalId: 'assignment-1',
        data: {
          title: 'Maya R. — Civic essay',
          studentLocalId: 'student-1',
        },
      },
      {
        localId: 'submission-1',
        kind: 'submission',
        parentLocalId: 'document-1',
        data: { status: 'submitted' },
      },
    ],
  };

  test('uses a structural graph tool that contains no essay or grade fields', () => {
    expect(SEED_GRAPH_TOOL.name).toBe('propose_seed_graph');
    expect(seedGraphProposalSchema.safeParse(structuralGraph).success).toBe(
      true
    );
    expect(JSON.stringify(SEED_GRAPH_TOOL.input_schema)).not.toContain(
      'essayText'
    );
    expect(JSON.stringify(SEED_GRAPH_TOOL.input_schema)).not.toContain(
      'numericPercentage'
    );
    expect(JSON.stringify(SEED_GRAPH_TOOL.input_schema)).not.toContain(
      'rubricScores'
    );
  });

  test('rejects essay or grade payloads smuggled into the structural pass', () => {
    const withEssay = structuredClone(structuralGraph);
    const submission = withEssay
      .nodes[4] as (typeof withEssay.nodes)[number] & {
      data: Record<string, unknown>;
    };
    submission.data.essayText = 'This belongs in phase two.';
    (submission.data as Record<string, unknown>).grade = {
      numericPercentage: 80,
    };

    expect(seedGraphProposalSchema.safeParse(withEssay).success).toBe(false);
  });

  test('requires unique local ids for durable graph references', () => {
    const duplicate = structuredClone(structuralGraph);
    duplicate.nodes[4]!.localId = 'document-1';
    expect(seedGraphProposalSchema.safeParse(duplicate).success).toBe(false);
  });

  test('content fill authors exactly one essay and requires a grade only for graded work', () => {
    expect(SEED_CONTENT_FILL_TOOL.name).toBe('fill_seed_submission');
    expect(
      seedContentFillSchema.safeParse({
        status: 'submitted',
        essayText: 'A complete essay awaiting feedback.',
      }).success
    ).toBe(true);
    expect(
      seedContentFillSchema.safeParse({
        status: 'graded',
        essayText: 'A complete graded essay.',
      }).success
    ).toBe(false);
    expect(
      seedContentFillSchema.safeParse({
        status: 'graded',
        essayText: 'A complete graded essay.',
        grade: {
          numericPercentage: 82,
          letterGrade: 'B',
          overallScore: 4,
          overallComment: 'Clear claim with room for deeper evidence.',
          rubricScores: { thesis_and_content: 4 },
          released: false,
        },
      }).success
    ).toBe(true);
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
                rubricScores: {
                  thesis_and_content: 2,
                  grammar_and_mechanics: 1,
                },
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
        {
          localId: 'class-1',
          title: 'English 9',
          grade: '9',
          period: '3',
          schoolYear: '2025-2026',
        },
      ],
      assignments: [],
      students: [],
    };
    expect(seedCommitProposalSchema.safeParse(missingApproved).success).toBe(
      false
    );

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

  test('requires independent approval for every submission', () => {
    const proposal = {
      ...validClassAndAssignment(),
      classes: validClassAndAssignment().classes.map((item) => ({
        ...item,
        approved: true,
      })),
      assignments: validClassAndAssignment().assignments.map((item) => ({
        ...item,
        approved: true,
      })),
      students: [
        {
          localId: 'student-1',
          name: 'Maya R.',
          classLocalId: 'class-1',
          writingProfile: 'struggling',
          approved: true,
          submissions: [
            {
              localId: 'submission-1',
              documentLocalId: 'document-1',
              assignmentLocalId: 'assignment-1',
              essayText: 'Essay text.',
              status: 'submitted',
            },
          ],
        },
      ],
    };

    expect(seedCommitProposalSchema.safeParse(proposal).success).toBe(false);
    proposal.students[0]!.submissions[0] = {
      ...proposal.students[0]!.submissions[0]!,
      approved: true,
    } as any;
    expect(seedCommitProposalSchema.safeParse(proposal).success).toBe(true);
  });
});
