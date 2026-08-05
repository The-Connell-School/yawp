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

export const seedSubmissionSchema = z
  .object({
    localId: z.string().min(1).max(100),
    assignmentLocalId: z.string().min(1).max(100),
    essayText: z.string().min(1).max(20_000),
    status: z.enum(['draft', 'submitted', 'graded']),
    grade: seedGradeSchema.optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.status === 'graded' && !value.grade) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['grade'],
        message: 'grade is required when status is "graded".',
      });
    }
  });

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
export const seedCommitStudentSchema = seedStudentSchema.extend({
  approved: z.boolean(),
});
export const seedCommitProposalSchema = z
  .object({
    classes: z.array(seedCommitClassSchema).max(10),
    assignments: z.array(seedCommitAssignmentSchema).max(20),
    students: z.array(seedCommitStudentSchema).max(60),
  })
  .strict();

export type SeedCommitProposal = z.infer<typeof seedCommitProposalSchema>;

const rubricScoresJsonSchema = {
  type: 'object',
  description:
    'Subset of the five rubric categories, each scored 1-5. Omit a category rather than guessing.',
  properties: Object.fromEntries(
    RUBRIC_CATEGORY_KEYS.map((key) => [
      key,
      { type: 'number', description: '1 (weak) to 5 (excellent).' },
    ])
  ),
  additionalProperties: false,
} as const;

/**
 * Tool definition handed to the Anthropic API via getLLMCompletion's `tools`
 * param. This IS the model-facing contract for structured output -- see
 * app/domain/reporter/reporter-tools.server.ts for the same
 * hand-written-JSON-Schema-next-to-its-zod-twin convention this follows.
 */
export const SEED_GENERATOR_TOOL = {
  name: 'propose_seed_data',
  description:
    'Propose new demo seed data for this organization: classes, assignments, and students (each with submissions and grades). This is a PROPOSAL ONLY -- nothing is written to the database until a human admin approves individual items in the UI. Call this exactly once with your complete proposal. Every essay must be full writing you author yourself, several paragraphs, in a voice that actually matches the requested writing profile -- a "struggling" writer should read as genuinely struggling (thin evidence, weak organization, mechanical errors), not just a shorter version of good writing.',
  input_schema: {
    type: 'object',
    properties: {
      classes: {
        type: 'array',
        description:
          'Brand-new classes to create. Leave empty if the request only adds students/assignments to a class already listed in the "existing classes" context.',
        items: {
          type: 'object',
          properties: {
            localId: {
              type: 'string',
              description: 'A unique id you invent for this class, e.g. "class-1".',
            },
            title: { type: 'string', description: 'e.g. "English 9 - Period 3".' },
            grade: { type: 'string', description: 'Grade level, e.g. "9".' },
            period: { type: 'string' },
            schoolYear: { type: 'string', description: 'e.g. "2025-2026".' },
          },
          required: ['localId', 'title', 'grade', 'period', 'schoolYear'],
          additionalProperties: false,
        },
      },
      assignments: {
        type: 'array',
        description:
          'New assignments, each attached to one class. A class needs at least one assignment before students can submit writing for it.',
        items: {
          type: 'object',
          properties: {
            localId: { type: 'string' },
            classLocalId: {
              type: 'string',
              description:
                'The localId of a class in THIS proposal\'s "classes" array, OR the id of an existing class from context.',
            },
            title: { type: 'string' },
            prompt: { type: 'string', description: 'The writing prompt shown to students.' },
            assignmentTypeTitle: {
              type: 'string',
              description:
                'Must exactly match one of the organization-enabled assignment type titles given in context.',
            },
          },
          required: ['localId', 'classLocalId', 'title', 'prompt', 'assignmentTypeTitle'],
          additionalProperties: false,
        },
      },
      students: {
        type: 'array',
        description: 'Students to create, each with their own writing.',
        items: {
          type: 'object',
          properties: {
            localId: { type: 'string' },
            name: { type: 'string', description: "The student's full name." },
            classLocalId: {
              type: 'string',
              description:
                'The localId of a class in THIS proposal\'s "classes" array, OR the id of an existing class from context.',
            },
            writingProfile: {
              type: 'string',
              enum: ['struggling', 'on_track', 'advanced'],
              description: 'Drives how the essay text you write for this student should read.',
            },
            submissions: {
              type: 'array',
              description: "This student's documents/submissions. At least one.",
              items: {
                type: 'object',
                properties: {
                  localId: { type: 'string' },
                  assignmentLocalId: {
                    type: 'string',
                    description:
                      'The localId of an assignment in THIS proposal\'s "assignments" array (not an id from context -- only newly proposed assignments can be referenced).',
                  },
                  essayText: {
                    type: 'string',
                    description:
                      "The full essay text, written by you in the student's voice per writingProfile. Several paragraphs, not a stub or a summary.",
                  },
                  status: {
                    type: 'string',
                    enum: ['draft', 'submitted', 'graded'],
                    description:
                      '"draft" = in-progress document only, no submission yet. "submitted" = submitted, awaiting grading. "graded" = submitted and graded.',
                  },
                  grade: {
                    type: 'object',
                    description: 'Required when status is "graded"; omit otherwise.',
                    properties: {
                      numericPercentage: { type: 'number' },
                      letterGrade: { type: 'string' },
                      overallScore: { type: 'number', description: '1-5.' },
                      overallComment: { type: 'string' },
                      rubricScores: rubricScoresJsonSchema,
                      released: {
                        type: 'boolean',
                        description: 'Whether the grade is released to the student yet.',
                      },
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
                required: ['localId', 'assignmentLocalId', 'essayText', 'status'],
                additionalProperties: false,
              },
            },
          },
          required: ['localId', 'name', 'classLocalId', 'writingProfile', 'submissions'],
          additionalProperties: false,
        },
      },
    },
    required: ['classes', 'assignments', 'students'],
    additionalProperties: false,
  },
} as const;
