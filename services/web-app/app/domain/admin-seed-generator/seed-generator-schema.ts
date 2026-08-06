/**
 * Admin seed-data generator: the structured-output contract between the LLM
 * and the write path.
 *
 * The model proposes classes, assignments, and students (with submissions and
 * grades) by calling the `propose_seed_data` tool exactly once. Nothing is
 * written from that call -- the route captures the tool input, the admin
 * approves individual items in the UI, and only the approved subset is
 * re-validated and written (see seed-generator-write.server.ts).
 *
 * Shapes here mirror the Prisma models they will become:
 * Class, Assignment, ClassAssignment, Document, Submission (packages/prisma/schema.prisma).
 */
import { z } from 'zod';

export const RUBRIC_CATEGORY_KEYS = [
  'thesis_and_content',
  'organization_and_structure',
  'evidence_and_support',
  'voice_and_style',
  'grammar_and_mechanics',
] as const;

export type RubricCategoryKey = (typeof RUBRIC_CATEGORY_KEYS)[number];

const rubricScoresSchema = z
  .object({
    thesis_and_content: z.number().int().min(1).max(5).optional(),
    organization_and_structure: z.number().int().min(1).max(5).optional(),
    evidence_and_support: z.number().int().min(1).max(5).optional(),
    voice_and_style: z.number().int().min(1).max(5).optional(),
    grammar_and_mechanics: z.number().int().min(1).max(5).optional(),
  })
  .strict();

export const seedGradeSchema = z
  .object({
    numericPercentage: z.number().int().min(0).max(100),
    letterGrade: z.string().min(1).max(3),
    overallScore: z.number().int().min(1).max(5),
    overallComment: z.string().min(1).max(2000),
    rubricScores: rubricScoresSchema,
    released: z.boolean(),
  })
  .strict();

const seedSubmissionBaseSchema = z
  .object({
    localId: z.string().min(1).max(100),
    assignmentLocalId: z.string().min(1).max(100),
    essayText: z.string().min(1).max(20_000),
    status: z.enum(['draft', 'submitted', 'graded']),
    grade: seedGradeSchema.optional(),
  })
  .strict();

function requireGradeForGradedSubmission(
  value: z.infer<typeof seedSubmissionBaseSchema>,
  ctx: z.RefinementCtx
) {
  if (value.status === 'graded' && !value.grade) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['grade'],
      message: 'grade is required when status is "graded".',
    });
  }
}

export const seedSubmissionSchema = seedSubmissionBaseSchema.superRefine(
  requireGradeForGradedSubmission
);

export const seedClassSchema = z
  .object({
    localId: z.string().min(1).max(100),
    title: z.string().min(1).max(200),
    grade: z.string().min(1).max(20),
    period: z.string().min(1).max(20),
    schoolYear: z.string().min(1).max(20),
  })
  .strict();

export const seedAssignmentSchema = z
  .object({
    localId: z.string().min(1).max(100),
    classLocalId: z.string().min(1).max(100),
    title: z.string().min(1).max(200),
    prompt: z.string().min(1).max(4000),
    assignmentTypeTitle: z.string().min(1).max(200),
  })
  .strict();

export const seedStudentSchema = z
  .object({
    localId: z.string().min(1).max(100),
    name: z.string().min(1).max(200),
    classLocalId: z.string().min(1).max(100),
    writingProfile: z.enum(['struggling', 'on_track', 'advanced']),
    submissions: z.array(seedSubmissionSchema).min(1).max(10),
  })
  .strict();

export const seedProposalSchema = z
  .object({
    classes: z.array(seedClassSchema).max(10),
    assignments: z.array(seedAssignmentSchema).max(20),
    students: z.array(seedStudentSchema).max(60),
  })
  .strict()
  .refine((v) => v.classes.length + v.students.length > 0, {
    message: 'Proposal must include at least one class or student.',
  });

export type SeedProposal = z.infer<typeof seedProposalSchema>;
export type SeedClassProposal = z.infer<typeof seedClassSchema>;
export type SeedAssignmentProposal = z.infer<typeof seedAssignmentSchema>;
export type SeedStudentProposal = z.infer<typeof seedStudentSchema>;
export type SeedSubmissionProposal = z.infer<typeof seedSubmissionSchema>;

// Commit payload: the client echoes back the exact proposal it was shown,
// with an `approved` flag stamped on every class/assignment/student. The
// server re-validates every field against the schemas above -- the client is
// never trusted to have left the content unmodified.
export const seedCommitClassSchema = seedClassSchema.extend({
  approved: z.boolean(),
});
export const seedCommitAssignmentSchema = seedAssignmentSchema.extend({
  approved: z.boolean(),
});
export const seedCommitSubmissionSchema = seedSubmissionBaseSchema
  .extend({
    approved: z.boolean(),
    documentLocalId: z.string().min(1).max(100).optional(),
  })
  .superRefine(requireGradeForGradedSubmission);
export const seedCommitStudentSchema = seedStudentSchema
  .omit({ submissions: true })
  .extend({
    approved: z.boolean(),
    existingMembershipId: z.string().min(1).optional(),
    submissions: z.array(seedCommitSubmissionSchema).min(1).max(10),
  });
export const seedCommitProposalSchema = z
  .object({
    classes: z.array(seedCommitClassSchema).max(10),
    assignments: z.array(seedCommitAssignmentSchema).max(20),
    students: z.array(seedCommitStudentSchema).max(60),
  })
  .strict();

export type SeedCommitProposal = z.infer<typeof seedCommitProposalSchema>;

export const seedNodeKindSchema = z.enum([
  'class',
  'assignment',
  'student',
  'document',
  'submission',
]);
export const seedNodeReviewStatusSchema = z.enum([
  'proposed',
  'approved',
  'rejected',
  'committed',
]);

const structuralNodeFields = {
  localId: z.string().min(1).max(100),
};

export const seedStructuralNodeSchema = z.discriminatedUnion('kind', [
  z
    .object({
      ...structuralNodeFields,
      kind: z.literal('class'),
      parentLocalId: z.null(),
      data: seedClassSchema.omit({ localId: true }),
    })
    .strict(),
  z
    .object({
      ...structuralNodeFields,
      kind: z.literal('assignment'),
      parentLocalId: z.string().min(1).max(100),
      data: seedAssignmentSchema.omit({
        localId: true,
        classLocalId: true,
      }),
    })
    .strict(),
  z
    .object({
      ...structuralNodeFields,
      kind: z.literal('student'),
      parentLocalId: z.string().min(1).max(100),
      data: seedStudentSchema
        .omit({ localId: true, classLocalId: true, submissions: true })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...structuralNodeFields,
      kind: z.literal('document'),
      parentLocalId: z.string().min(1).max(100),
      data: z
        .object({
          title: z.string().min(1).max(200),
          studentLocalId: z.string().min(1).max(100),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...structuralNodeFields,
      kind: z.literal('submission'),
      parentLocalId: z.string().min(1).max(100),
      data: z
        .object({ status: z.enum(['draft', 'submitted', 'graded']) })
        .strict(),
    })
    .strict(),
]);

export const seedGraphProposalSchema = z
  .object({
    nodes: z.array(seedStructuralNodeSchema).min(1).max(150),
  })
  .strict()
  .superRefine((value, context) => {
    const seen = new Set<string>();
    for (const [index, node] of value.nodes.entries()) {
      if (seen.has(node.localId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['nodes', index, 'localId'],
          message: `Duplicate localId "${node.localId}".`,
        });
      }
      seen.add(node.localId);
    }
  });

export const seedContentFillSchema = z
  .object({
    status: z.enum(['draft', 'submitted', 'graded']),
    essayText: z.string().min(1).max(20_000),
    grade: seedGradeSchema.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.status === 'graded' && !value.grade) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['grade'],
        message: 'grade is required when status is "graded".',
      });
    }
    if (value.status !== 'graded' && value.grade) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['grade'],
        message: 'grade must be omitted unless status is "graded".',
      });
    }
  });

export type SeedStructuralNode = z.infer<typeof seedStructuralNodeSchema>;
export type SeedGraphProposal = z.infer<typeof seedGraphProposalSchema>;
export type SeedContentFill = z.infer<typeof seedContentFillSchema>;
export type SeedNodeKind = z.infer<typeof seedNodeKindSchema>;
export type SeedNodeReviewStatus = z.infer<typeof seedNodeReviewStatusSchema>;

const structuralNodeJsonSchema = {
  oneOf: [
    {
      type: 'object',
      properties: {
        localId: { type: 'string' },
        kind: { const: 'class' },
        parentLocalId: { type: 'null' },
        data: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            grade: { type: 'string' },
            period: { type: 'string' },
            schoolYear: { type: 'string' },
          },
          required: ['title', 'grade', 'period', 'schoolYear'],
          additionalProperties: false,
        },
      },
      required: ['localId', 'kind', 'parentLocalId', 'data'],
      additionalProperties: false,
    },
    {
      type: 'object',
      properties: {
        localId: { type: 'string' },
        kind: { const: 'assignment' },
        parentLocalId: {
          type: 'string',
          description: 'The localId of its class, or an existing class id.',
        },
        data: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            prompt: { type: 'string' },
            assignmentTypeTitle: { type: 'string' },
          },
          required: ['title', 'prompt', 'assignmentTypeTitle'],
          additionalProperties: false,
        },
      },
      required: ['localId', 'kind', 'parentLocalId', 'data'],
      additionalProperties: false,
    },
    {
      type: 'object',
      properties: {
        localId: { type: 'string' },
        kind: { const: 'student' },
        parentLocalId: {
          type: 'string',
          description: 'The localId of their class, or an existing class id.',
        },
        data: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            writingProfile: {
              type: 'string',
              enum: ['struggling', 'on_track', 'advanced'],
            },
          },
          required: ['name', 'writingProfile'],
          additionalProperties: false,
        },
      },
      required: ['localId', 'kind', 'parentLocalId', 'data'],
      additionalProperties: false,
    },
    {
      type: 'object',
      properties: {
        localId: { type: 'string' },
        kind: { const: 'document' },
        parentLocalId: {
          type: 'string',
          description: 'The localId of the assignment this document answers.',
        },
        data: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            studentLocalId: {
              type: 'string',
              description: 'The localId of the student who owns this document.',
            },
          },
          required: ['title', 'studentLocalId'],
          additionalProperties: false,
        },
      },
      required: ['localId', 'kind', 'parentLocalId', 'data'],
      additionalProperties: false,
    },
    {
      type: 'object',
      properties: {
        localId: { type: 'string' },
        kind: { const: 'submission' },
        parentLocalId: {
          type: 'string',
          description: 'The localId of the document being submitted.',
        },
        data: {
          type: 'object',
          properties: {
            status: {
              type: 'string',
              enum: ['draft', 'submitted', 'graded'],
            },
          },
          required: ['status'],
          additionalProperties: false,
        },
      },
      required: ['localId', 'kind', 'parentLocalId', 'data'],
      additionalProperties: false,
    },
  ],
} as const;

export const SEED_GRAPH_TOOL = {
  name: 'propose_seed_graph',
  description:
    'Propose only the structural entity graph for demo data. Include relationships and submission state, but never essay prose or grading results.',
  input_schema: {
    type: 'object',
    properties: {
      nodes: {
        type: 'array',
        minItems: 1,
        maxItems: 150,
        items: structuralNodeJsonSchema,
      },
    },
    required: ['nodes'],
    additionalProperties: false,
  },
} as const;

export const SEED_CONTENT_FILL_TOOL = {
  name: 'fill_seed_submission',
  description:
    'Author content for exactly one proposed submission. Return its full essay and, only when its status is graded, a grounded grade.',
  input_schema: {
    type: 'object',
    properties: {
      status: { type: 'string', enum: ['draft', 'submitted', 'graded'] },
      essayText: {
        type: 'string',
        description: 'The complete essay text for this one document.',
      },
      grade: {
        type: 'object',
        properties: {
          numericPercentage: { type: 'number' },
          letterGrade: { type: 'string' },
          overallScore: { type: 'number' },
          overallComment: { type: 'string' },
          rubricScores: {
            type: 'object',
            properties: Object.fromEntries(
              RUBRIC_CATEGORY_KEYS.map((key) => [
                key,
                { type: 'number', description: '1 (weak) to 5 (excellent).' },
              ])
            ),
            additionalProperties: false,
          },
          released: { type: 'boolean' },
        },
        required: [
          'numericPercentage',
          'letterGrade',
          'overallScore',
          'overallComment',
          'rubricScores',
          'released',
        ],
        additionalProperties: false,
      },
    },
    required: ['status', 'essayText'],
    additionalProperties: false,
  },
} as const;
