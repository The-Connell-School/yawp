/**
 * Yawp Reporter tool layer.
 *
 * Defines the read-only tools the reporter LLM can call and dispatches them to
 * teacher-scoped Prisma queries. Every query is anchored to the calling
 * teacher's OrgMembership and organization, so the model can never read data
 * belonging to another teacher, class, or org.
 */
import { z } from 'zod';
import { prisma } from '~/utils/db.server';
import { formatClassCardTitle } from '~/utils/class-display';
import { parseGrammarIssuesPayload } from '~/domain/grading/grammarIssues';
import {
  readRubricEntryScore,
  type SubmissionRubricEntry,
} from '~/domain/assignment-insights/aggregate-rubric-performance';
import {
  buildGrowthSeries,
  buildPlanProgress,
  buildRubricTrends,
  captureRubricLevels,
  findStudentsNeedingAttention,
  summarizeClassRubrics,
  summarizeStudentGrades,
  type GradedSubmissionRow,
  type PlanBaseline,
} from './reporter-report';

export type ReporterToolContext = {
  /** The calling teacher's OrgMembership id. */
  membershipId: string;
  /** The calling teacher's organization id. */
  organizationId: string;
  /** Model-requested writes staged until the containing LLM turn succeeds. */
  pendingGrowthPlanSaves?: Map<string, PendingReporterGrowthPlan>;
};

export type PendingReporterGrowthPlan = {
  membershipId: string;
  organizationId: string;
  studentMembershipId: string;
  studentName: string;
  focus: string;
  targetSkills: string[];
  body: string;
  baseline: PlanBaseline;
  checkInAt: Date | null;
};

type ReporterGrowthPlanWriter = {
  reporterGrowthPlan: {
    updateMany: (args: any) => Promise<unknown>;
    create: (args: any) => Promise<{ id: string }>;
  };
};

export type ReporterTool = {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
};

/**
 * Tool definitions handed to the Anthropic API. Kept intentionally small and
 * declarative; the JSON Schemas double as the model-facing contract.
 */
export const REPORTER_TOOLS: ReporterTool[] = [
  {
    name: 'list_classes',
    description:
      "List the teacher's active classes with student and assignment counts. Use this first to discover class ids before asking for a class-level report.",
    input_schema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: 'get_class_grade_report',
    description:
      "Get a grade summary for one class: each student's average percentage across released, graded submissions, plus the class average. Only released grades are included.",
    input_schema: {
      type: 'object',
      properties: {
        classId: { type: 'string', description: 'The class id to report on.' },
      },
      required: ['classId'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_student_grade_report',
    description:
      "Get a single student's released, graded submissions across the classes this teacher teaches, with per-assignment scores and an overall average.",
    input_schema: {
      type: 'object',
      properties: {
        student: {
          type: 'string',
          description:
            "The student's full name (as shown in a class report) or their OrgMembership id. Names are matched within the classes this teacher teaches.",
        },
      },
      required: ['student'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_student_growth',
    description:
      'Get a chronological growth series for one student: their released grades over time, with the first→latest change and a trend label. Use this for growth reports.',
    input_schema: {
      type: 'object',
      properties: {
        student: {
          type: 'string',
          description:
            "The student's full name (as shown in a class report) or their OrgMembership id. Names are matched within the classes this teacher teaches.",
        },
      },
      required: ['student'],
      additionalProperties: false,
    },
  },
  {
    name: 'find_students_needing_attention',
    description:
      "Scan every released, graded submission across the teacher's classes (or one class) and return the students who look like they need attention — a below-threshold average, a declining overall trend, or slipping specific writing skills — ranked by severity. Use this to answer 'who needs attention / who is struggling?' in one call instead of walking student by student.",
    input_schema: {
      type: 'object',
      properties: {
        classId: {
          type: 'string',
          description:
            'Optional. Restrict the scan to one class (from list_classes). Omit to scan every class the teacher teaches.',
        },
        averageThreshold: {
          type: 'number',
          description:
            'Optional grade cutoff (0–100). Students at or above it on average are not flagged for a low grade. Defaults to 70.',
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_submission_detail',
    description:
      "Get the actual writing evidence for ONE graded submission: an excerpt of the student's essay, the teacher's inline margin comments (each tied to the quoted text it marks), the overall written feedback, the per-rubric scores, and any flagged grammar/style issues. Use this to talk specifically about a student's writing — quoting their real sentences and your own comments — after a grade or growth report surfaces a submissionId worth examining. Pass a submissionId returned by get_student_grade_report or get_student_growth.",
    input_schema: {
      type: 'object',
      properties: {
        submissionId: {
          type: 'string',
          description:
            'The submissionId of a released, graded submission (as returned by the grade or growth report tools).',
        },
      },
      required: ['submissionId'],
      additionalProperties: false,
    },
  },
  {
    name: 'list_growth_plans',
    description:
      "List the teacher's saved writing growth plans, each with progress since its baseline (change in overall average and in each targeted rubric skill). Pass a student to get that student's active plan and its full body. ALWAYS call this before writing a student growth or grade report: if the student has an active plan, weave in how they are progressing against it.",
    input_schema: {
      type: 'object',
      properties: {
        student: {
          type: 'string',
          description:
            "Optional. A student's full name or OrgMembership id to fetch just their plan(s), including the plan body. Omit to list active plans across all students.",
        },
        includeArchived: {
          type: 'boolean',
          description:
            'Optional. Include archived/completed plans as well as active ones. Defaults to false (active only).',
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'save_growth_plan',
    description:
      'Propose a writing growth plan for explicit teacher confirmation. Call this AFTER presenting the exact plan. The application, not the model, decides whether to persist it after the teacher clicks Save.',
    input_schema: {
      type: 'object',
      properties: {
        student: {
          type: 'string',
          description:
            "The student's full name or OrgMembership id, matched within your classes.",
        },
        focus: {
          type: 'string',
          description:
            'A one-line focus/goal for the plan (e.g. "Turn description into analysis").',
        },
        targetSkills: {
          type: 'array',
          items: { type: 'string' },
          description:
            'The rubric category keys the plan targets, e.g. ["evidence_and_support","organization_and_structure"]. 1–5 skills. Use the exact keys returned by the rubric tools.',
        },
        body: {
          type: 'string',
          description:
            'The full plan text (Markdown) exactly as shown to the teacher: focus, skill priorities, instructional moves, cadence, and conference talking points.',
        },
        checkInInDays: {
          type: 'number',
          description:
            'Optional. Days from now to schedule a check-in (1–180).',
        },
      },
      required: ['student', 'focus', 'targetSkills', 'body'],
      additionalProperties: false,
    },
  },
];

const classIdSchema = z.object({ classId: z.string().min(1) });
const studentSchema = z.object({ student: z.string().min(1) });
const submissionIdSchema = z.object({ submissionId: z.string().min(1) });

/** Caps for get_submission_detail so a single essay can't blow the token budget. */
const MAX_ESSAY_EXCERPT_CHARS = 1400;
const MAX_INLINE_COMMENTS = 20;
const MAX_COMMENT_CHARS = 400;
const MAX_GRAMMAR_ISSUES = 15;
const MAX_SCOPED_SUBMISSIONS = 500;
const MAX_TOOL_RESULT_CHARS = 32_000;
const MAX_TOOL_RESULT_PREVIEW_CHARS = 28_000;

/**
 * Bound an essay body to a readable opening excerpt so the model has real text
 * to quote without pulling an entire paper into context.
 */
function buildEssayExcerpt(
  text: string | null | undefined
): { excerpt: string; truncated: boolean; totalChars: number } | null {
  const normalized = text?.trim();
  if (!normalized) return null;
  if (normalized.length <= MAX_ESSAY_EXCERPT_CHARS) {
    return {
      excerpt: normalized,
      truncated: false,
      totalChars: normalized.length,
    };
  }
  return {
    excerpt: `${normalized.slice(0, MAX_ESSAY_EXCERPT_CHARS).trimEnd()}…`,
    truncated: true,
    totalChars: normalized.length,
  };
}

/**
 * Fetch released, graded submissions for a set of classes taught by the
 * teacher, normalized into the shape the pure report functions expect.
 */
async function fetchScopedGradedRows(where: {
  organizationId: string;
  teacherMembershipId: string;
  classId?: string;
  studentMembershipId?: string;
  studentMembershipIds?: string[];
}): Promise<{
  rows: GradedSubmissionRow[];
  sourceTruncated: boolean;
  sourceLimit: number;
}> {
  const submissions = await prisma.submission.findMany({
    where: {
      releasedAt: { not: null },
      gradedAt: { not: null },
      archivedAt: null,
      document: {
        artifactKind: 'STUDENT',
        ...(where.studentMembershipId
          ? { membershipId: where.studentMembershipId }
          : where.studentMembershipIds
            ? { membershipId: { in: where.studentMembershipIds } }
            : {}),
        classAssignment: {
          class: {
            ...(where.classId ? { id: where.classId } : {}),
            teachers: { some: { id: where.teacherMembershipId } },
            school: { organizationId: where.organizationId },
          },
        },
      },
    },
    select: {
      id: true,
      submittedAt: true,
      numericPercentage: true,
      letterGrade: true,
      rubricScores: true,
      overallComment: true,
      document: {
        select: {
          membershipId: true,
          membership: { select: { user: { select: { name: true } } } },
          classAssignment: {
            select: { assignment: { select: { title: true } } },
          },
        },
      },
    },
    orderBy: { submittedAt: 'desc' },
    // Fetch one sentinel row so callers can distinguish an exact 500-row
    // result from a larger source that was capped for model context safety.
    take: MAX_SCOPED_SUBMISSIONS + 1,
  });

  const sourceTruncated = submissions.length > MAX_SCOPED_SUBMISSIONS;
  const rows = submissions
    .slice(0, MAX_SCOPED_SUBMISSIONS)
    .flatMap((submission) => {
      if (
        !submission.document.membershipId ||
        !submission.document.membership
      ) {
        return [];
      }
      return [
        {
          submissionId: submission.id,
          studentMembershipId: submission.document.membershipId,
          studentName:
            submission.document.membership.user.name ?? 'Unknown student',
          assignmentTitle:
            submission.document.classAssignment?.assignment.title ??
            'Untitled assignment',
          submittedAt: submission.submittedAt,
          numericPercentage: submission.numericPercentage,
          letterGrade: submission.letterGrade,
          rubricScores: normalizeRubricScores(submission.rubricScores),
          overallComment: submission.overallComment,
        },
      ];
    });
  return {
    rows,
    sourceTruncated,
    sourceLimit: MAX_SCOPED_SUBMISSIONS,
  };
}

/** Coerce a stored rubricScores JSON blob into a { category: number } map. */
function normalizeRubricScores(value: unknown): Record<string, number> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const out: Record<string, number> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    const score = readRubricEntryScore(raw as SubmissionRubricEntry);
    if (score !== null) out[key] = score;
  }
  return Object.keys(out).length > 0 ? out : null;
}

async function listClasses(ctx: ReporterToolContext) {
  const classes = await prisma.class.findMany({
    where: {
      isArchived: false,
      teachers: { some: { id: ctx.membershipId } },
      school: { organizationId: ctx.organizationId },
    },
    select: {
      id: true,
      title: true,
      grade: true,
      period: true,
      schoolYear: true,
      _count: { select: { students: true, classAssignments: true } },
    },
    orderBy: [{ schoolYear: 'desc' }, { period: 'asc' }],
    take: 100,
  });

  return {
    classes: classes.map((klass) => ({
      classId: klass.id,
      title: formatClassCardTitle(klass),
      grade: klass.grade,
      period: klass.period,
      schoolYear: klass.schoolYear,
      studentCount: klass._count.students,
      assignmentCount: klass._count.classAssignments,
    })),
  };
}

async function getClassGradeReport(ctx: ReporterToolContext, input: unknown) {
  const { classId } = classIdSchema.parse(input);
  const klass = await prisma.class.findFirst({
    where: {
      id: classId,
      teachers: { some: { id: ctx.membershipId } },
      school: { organizationId: ctx.organizationId },
    },
    select: { id: true, title: true, grade: true, period: true },
  });

  if (!klass) {
    return { error: 'Class not found or not taught by you.' };
  }

  const { rows, sourceTruncated, sourceLimit } = await fetchScopedGradedRows({
    organizationId: ctx.organizationId,
    teacherMembershipId: ctx.membershipId,
    classId,
  });
  const students = summarizeStudentGrades(rows);
  const classAverages = students
    .map((student) => student.averagePercentage)
    .filter((value): value is number => typeof value === 'number');
  const classAveragePercentage =
    classAverages.length > 0
      ? Math.round(
          classAverages.reduce((sum, value) => sum + value, 0) /
            classAverages.length
        )
      : null;

  return {
    class: {
      classId: klass.id,
      title: formatClassCardTitle(klass),
      grade: klass.grade,
      period: klass.period,
    },
    gradedSubmissionCount: rows.length,
    sourceTruncated,
    sourceLimit,
    sourceWarning: sourceTruncated
      ? `This report uses the ${sourceLimit} most recent graded submissions and is not a complete class history.`
      : null,
    classAveragePercentage,
    // Per-writing-skill class averages, so "what's my class weakest at?" is
    // answerable from this one report without walking student by student.
    rubricSummary: summarizeClassRubrics(rows),
    students,
  };
}

const attentionSchema = z.object({
  classId: z.string().min(1).optional(),
  averageThreshold: z.number().min(0).max(100).optional(),
});

/** Cap the flagged list so a very large scan can't blow the token budget. */
const MAX_ATTENTION_STUDENTS = 40;

async function findAttention(ctx: ReporterToolContext, input: unknown) {
  const { classId, averageThreshold } = attentionSchema.parse(input);

  const { rows, sourceTruncated, sourceLimit } = await fetchScopedGradedRows({
    organizationId: ctx.organizationId,
    teacherMembershipId: ctx.membershipId,
    ...(classId ? { classId } : {}),
  });

  const flagged = findStudentsNeedingAttention(rows, { averageThreshold });
  const studentsConsidered = new Set(rows.map((row) => row.studentMembershipId))
    .size;

  return {
    averageThreshold: averageThreshold ?? 70,
    scope: classId ? 'class' : 'all_classes',
    sourceTruncated,
    sourceLimit,
    sourceWarning: sourceTruncated
      ? `This scan uses the ${sourceLimit} most recent graded submissions and is not a complete all-time scan.`
      : null,
    studentsConsidered,
    flaggedCount: flagged.length,
    truncated: flagged.length > MAX_ATTENTION_STUDENTS,
    students: flagged.slice(0, MAX_ATTENTION_STUDENTS),
  };
}

type ResolvedStudent = {
  id: string;
  name: string;
};

type StudentResolution =
  | { student: ResolvedStudent }
  | {
      error: string;
      ambiguous?: Array<{ studentMembershipId: string; studentName: string }>;
    };

/**
 * Resolve a student from a name or an OrgMembership id, always scoped to the
 * teacher's classes. Chat callers usually only have the student's name (from a
 * class report), so name lookup is the primary path; the id path stays for
 * precision. Ambiguous names return the candidates so the caller can
 * disambiguate rather than silently guessing.
 */
async function resolveStudent(
  ctx: ReporterToolContext,
  student: string
): Promise<StudentResolution> {
  const query = student.trim();
  const inTeacherClass = {
    role: 'STUDENT' as const,
    organizationId: ctx.organizationId,
    classesAsStudent: {
      some: { teachers: { some: { id: ctx.membershipId } } },
    },
  };

  // Exact id first (cheap, unambiguous).
  const byId = await prisma.orgMembership.findFirst({
    where: { ...inTeacherClass, id: query },
    select: { id: true, user: { select: { name: true } } },
  });
  if (byId) {
    return {
      student: { id: byId.id, name: byId.user.name ?? 'Unknown student' },
    };
  }

  // Then by name, case-insensitively, within the teacher's classes.
  const byName = await prisma.orgMembership.findMany({
    where: {
      ...inTeacherClass,
      user: { name: { equals: query, mode: 'insensitive' } },
    },
    select: { id: true, user: { select: { name: true } } },
  });

  if (byName.length === 1) {
    return {
      student: {
        id: byName[0].id,
        name: byName[0].user.name ?? 'Unknown student',
      },
    };
  }

  if (byName.length > 1) {
    return {
      error: `More than one student matches "${query}". Ask which one.`,
      ambiguous: byName.map((match) => ({
        studentMembershipId: match.id,
        studentName: match.user.name ?? 'Unknown student',
      })),
    };
  }

  return {
    error: `No student named "${query}" was found in your classes. Check the spelling, or run a class grade report to see the exact names.`,
  };
}

async function getStudentGradeReport(ctx: ReporterToolContext, input: unknown) {
  const { student: studentQuery } = studentSchema.parse(input);
  const resolved = await resolveStudent(ctx, studentQuery);
  if ('error' in resolved) return resolved;
  const { student } = resolved;

  const { rows, sourceTruncated, sourceLimit } = await fetchScopedGradedRows({
    organizationId: ctx.organizationId,
    teacherMembershipId: ctx.membershipId,
    studentMembershipId: student.id,
  });
  const [summary] = summarizeStudentGrades(rows);

  return {
    student: { studentMembershipId: student.id, studentName: student.name },
    sourceTruncated,
    sourceLimit,
    sourceWarning: sourceTruncated
      ? `This report uses the ${sourceLimit} most recent graded submissions and is not a complete history.`
      : null,
    averagePercentage: summary?.averagePercentage ?? null,
    latestLetterGrade: summary?.latestLetterGrade ?? null,
    rubricTrends: buildRubricTrends(rows),
    submissions: rows.map((row) => ({
      submissionId: row.submissionId,
      assignmentTitle: row.assignmentTitle,
      submittedAt: row.submittedAt.toISOString(),
      numericPercentage: row.numericPercentage,
      letterGrade: row.letterGrade,
      rubricScores: row.rubricScores ?? null,
      comment: row.overallComment ?? null,
    })),
  };
}

async function getStudentGrowth(ctx: ReporterToolContext, input: unknown) {
  const { student: studentQuery } = studentSchema.parse(input);
  const resolved = await resolveStudent(ctx, studentQuery);
  if ('error' in resolved) return resolved;
  const { student } = resolved;

  const { rows, sourceTruncated, sourceLimit } = await fetchScopedGradedRows({
    organizationId: ctx.organizationId,
    teacherMembershipId: ctx.membershipId,
    studentMembershipId: student.id,
  });

  const growth = buildGrowthSeries(rows);

  return {
    student: { studentMembershipId: student.id, studentName: student.name },
    sourceTruncated,
    sourceLimit,
    sourceWarning: sourceTruncated
      ? `This report uses the ${sourceLimit} most recent graded submissions and is not a complete history.`
      : null,
    ...growth,
    rubricTrends: buildRubricTrends(rows),
    // Attach rubric detail and any written feedback to each point so the model
    // can talk specifically about the writing, not just the score.
    points: growth.points.map((point) => {
      const source = rows.find(
        (row) => row.submissionId === point.submissionId
      );
      return {
        ...point,
        rubricScores: source?.rubricScores ?? null,
        comment: source?.overallComment ?? null,
      };
    }),
  };
}

async function getSubmissionDetail(ctx: ReporterToolContext, input: unknown) {
  const { submissionId } = submissionIdSchema.parse(input);
  const submission = await prisma.submission.findFirst({
    where: {
      id: submissionId,
      releasedAt: { not: null },
      gradedAt: { not: null },
      archivedAt: null,
      document: {
        artifactKind: 'STUDENT',
        classAssignment: {
          class: {
            teachers: { some: { id: ctx.membershipId } },
            school: { organizationId: ctx.organizationId },
          },
        },
      },
    },
    select: {
      id: true,
      text: true,
      submittedAt: true,
      numericPercentage: true,
      letterGrade: true,
      overallScore: true,
      rubricScores: true,
      overallComment: true,
      feedback: true,
      grammarIssues: true,
      document: {
        select: {
          membership: { select: { user: { select: { name: true } } } },
          classAssignment: {
            select: { assignment: { select: { title: true } } },
          },
        },
      },
      comments: {
        orderBy: { createdAt: 'asc' },
        select: { content: true, excerpt: true },
      },
    },
  });

  if (!submission) {
    return {
      error:
        'Submission not found in your classes, or its grade is not released yet.',
    };
  }

  if (!submission.document.membership) {
    return {
      error: 'Group submissions are not part of individual student reports.',
    };
  }

  const grammarIssues = parseGrammarIssuesPayload(submission.grammarIssues, {
    sourceText: submission.text ?? undefined,
  })
    .slice(0, MAX_GRAMMAR_ISSUES)
    .map((issue) => ({
      excerpt: issue.excerpt,
      message: issue.message,
      kind: issue.kind,
      rule: issue.rule ?? null,
    }));

  // Teacher margin comments, each tied to the quoted text it marks. This is the
  // richest writing signal the reporter has — the human read of the actual prose.
  const inlineComments = submission.comments
    .slice(0, MAX_INLINE_COMMENTS)
    .map((comment) => ({
      excerpt: comment.excerpt ?? null,
      comment: comment.content.slice(0, MAX_COMMENT_CHARS),
    }));

  return {
    submissionId: submission.id,
    student: {
      studentName:
        submission.document.membership.user.name ?? 'Unknown student',
    },
    assignmentTitle:
      submission.document.classAssignment?.assignment.title ??
      'Untitled assignment',
    submittedAt: submission.submittedAt.toISOString(),
    numericPercentage: submission.numericPercentage,
    letterGrade: submission.letterGrade,
    overallScore: submission.overallScore,
    rubricScores: normalizeRubricScores(submission.rubricScores),
    overallComment: submission.overallComment ?? null,
    feedback: submission.feedback ?? null,
    inlineComments,
    inlineCommentCount: submission.comments.length,
    grammarIssues,
    essayExcerpt: buildEssayExcerpt(submission.text),
  };
}

const saveGrowthPlanSchema = z.object({
  student: z.string().min(1),
  focus: z.string().min(1).max(200),
  targetSkills: z.array(z.string().min(1)).min(1).max(5),
  body: z.string().min(1).max(8000),
  checkInInDays: z.number().int().min(1).max(180).optional(),
});

const listGrowthPlansSchema = z.object({
  student: z.string().min(1).optional(),
  includeArchived: z.boolean().optional(),
});

const DAY_MS = 24 * 60 * 60 * 1000;

/** Coerce a stored targetSkills JSON blob into a string[] of category keys. */
function parseTargetSkills(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string');
}

/** Coerce a stored baseline JSON blob back into a PlanBaseline. */
function parsePlanBaseline(value: unknown): PlanBaseline | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const obj = value as Record<string, unknown>;
  const rubricLevels: Record<string, number> = {};
  const rawLevels = obj.rubricLevels;
  if (rawLevels && typeof rawLevels === 'object' && !Array.isArray(rawLevels)) {
    for (const [key, raw] of Object.entries(
      rawLevels as Record<string, unknown>
    )) {
      if (typeof raw === 'number' && !Number.isNaN(raw))
        rubricLevels[key] = raw;
    }
  }
  return {
    averagePercentage:
      typeof obj.averagePercentage === 'number' ? obj.averagePercentage : null,
    rubricLevels,
    capturedAt: typeof obj.capturedAt === 'string' ? obj.capturedAt : '',
  };
}

async function saveGrowthPlan(ctx: ReporterToolContext, input: unknown) {
  const parsed = saveGrowthPlanSchema.parse(input);
  const resolved = await resolveStudent(ctx, parsed.student);
  if ('error' in resolved) return resolved;
  const { student } = resolved;

  const { rows, sourceTruncated } = await fetchScopedGradedRows({
    organizationId: ctx.organizationId,
    teacherMembershipId: ctx.membershipId,
    studentMembershipId: student.id,
  });
  if (sourceTruncated) {
    return {
      error:
        'The student has more than 500 graded submissions. Narrow the reporting scope before saving a baseline.',
    };
  }
  const baseline: PlanBaseline = {
    ...captureRubricLevels(rows),
    capturedAt: new Date().toISOString(),
  };
  const checkInAt =
    parsed.checkInInDays != null
      ? new Date(Date.now() + parsed.checkInInDays * DAY_MS)
      : null;

  const pending: PendingReporterGrowthPlan = {
    membershipId: ctx.membershipId,
    organizationId: ctx.organizationId,
    studentMembershipId: student.id,
    studentName: student.name,
    focus: parsed.focus,
    targetSkills: parsed.targetSkills,
    body: parsed.body,
    baseline,
    checkInAt,
  };

  if (ctx.pendingGrowthPlanSaves) {
    // Last request for the same student wins within one model turn. Persistence
    // happens only after the provider returns a successful final response.
    ctx.pendingGrowthPlanSaves.set(student.id, pending);
  }

  const [planId] = ctx.pendingGrowthPlanSaves
    ? [null]
    : await prisma.$transaction((transaction) =>
        commitReporterGrowthPlans([pending], transaction)
      );

  return {
    saved: !ctx.pendingGrowthPlanSaves,
    requiresTeacherConfirmation: Boolean(ctx.pendingGrowthPlanSaves),
    pendingCommit: Boolean(ctx.pendingGrowthPlanSaves),
    planId,
    student: { studentMembershipId: student.id, studentName: student.name },
    focus: parsed.focus,
    targetSkills: parsed.targetSkills,
    baseline,
    checkInAt: checkInAt?.toISOString() ?? null,
  };
}

/**
 * Atomically replaces active growth plans. The route calls this inside the same
 * transaction that persists the successful conversation turn, so provider
 * errors and failed retries cannot leave model-controlled writes behind.
 */
export async function commitReporterGrowthPlans(
  plans: PendingReporterGrowthPlan[],
  db: ReporterGrowthPlanWriter = prisma
): Promise<string[]> {
  const ids: string[] = [];
  for (const plan of plans) {
    await db.reporterGrowthPlan.updateMany({
      where: {
        membershipId: plan.membershipId,
        studentMembershipId: plan.studentMembershipId,
        status: 'active',
      },
      data: { status: 'archived' },
    });
    const created = await db.reporterGrowthPlan.create({
      data: {
        membershipId: plan.membershipId,
        organizationId: plan.organizationId,
        studentMembershipId: plan.studentMembershipId,
        status: 'active',
        focus: plan.focus,
        targetSkills: plan.targetSkills,
        body: plan.body,
        baseline: plan.baseline,
        checkInAt: plan.checkInAt,
      },
      select: { id: true },
    });
    ids.push(created.id);
  }
  return ids;
}

async function listGrowthPlans(ctx: ReporterToolContext, input: unknown) {
  const parsed = listGrowthPlansSchema.parse(input);

  let studentFilterId: string | undefined;
  if (parsed.student) {
    const resolved = await resolveStudent(ctx, parsed.student);
    if ('error' in resolved) return resolved;
    studentFilterId = resolved.student.id;
  }

  const statuses = parsed.includeArchived
    ? ['active', 'archived', 'completed']
    : ['active'];

  const plans = await prisma.reporterGrowthPlan.findMany({
    where: {
      membershipId: ctx.membershipId,
      organizationId: ctx.organizationId,
      status: { in: statuses },
      ...(studentFilterId ? { studentMembershipId: studentFilterId } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: 25,
    select: {
      id: true,
      status: true,
      focus: true,
      targetSkills: true,
      body: true,
      baseline: true,
      checkInAt: true,
      createdAt: true,
      studentMembershipId: true,
      student: { select: { user: { select: { name: true } } } },
    },
  });

  // Include the full plan body only when the teacher asked about one student,
  // to keep the cross-student list lean.
  const includeBody = parsed.student != null;

  const studentIds = [
    ...new Set(plans.map((plan) => plan.studentMembershipId)),
  ];
  const currentResult =
    studentIds.length > 0
      ? await fetchScopedGradedRows({
          organizationId: ctx.organizationId,
          teacherMembershipId: ctx.membershipId,
          studentMembershipIds: studentIds,
        })
      : {
          rows: [] as GradedSubmissionRow[],
          sourceTruncated: false,
          sourceLimit: MAX_SCOPED_SUBMISSIONS,
        };
  const currentRows = currentResult.rows;
  const rowsByStudent = new Map<string, GradedSubmissionRow[]>();
  for (const row of currentRows) {
    const rows = rowsByStudent.get(row.studentMembershipId) ?? [];
    rows.push(row);
    rowsByStudent.set(row.studentMembershipId, rows);
  }

  const detailed = [];
  for (const plan of plans) {
    const targetSkills = parseTargetSkills(plan.targetSkills);
    const baseline = parsePlanBaseline(plan.baseline);
    const rows = rowsByStudent.get(plan.studentMembershipId) ?? [];
    detailed.push({
      planId: plan.id,
      status: plan.status,
      focus: plan.focus,
      targetSkills,
      checkInAt: plan.checkInAt?.toISOString() ?? null,
      createdAt: plan.createdAt.toISOString(),
      student: {
        studentMembershipId: plan.studentMembershipId,
        studentName: plan.student.user.name ?? 'Unknown student',
      },
      progress: baseline
        ? buildPlanProgress(baseline, targetSkills, rows)
        : null,
      ...(includeBody ? { body: plan.body } : {}),
    });
  }

  return {
    planCount: detailed.length,
    sourceTruncated: currentResult.sourceTruncated,
    sourceLimit: currentResult.sourceLimit,
    sourceWarning: currentResult.sourceTruncated
      ? `Progress uses the ${currentResult.sourceLimit} most recent graded submissions and is not a complete history.`
      : null,
    plans: detailed,
  };
}

/**
 * Dispatch a reporter tool call by name. Returns a JSON string (the format the
 * getLLMCompletion tool loop feeds back to the model). Unknown tools and
 * validation failures are returned as structured errors rather than thrown, so
 * a bad model call degrades gracefully instead of failing the whole request.
 */
export async function handleReporterToolCall(
  name: string,
  input: Record<string, unknown>,
  ctx: ReporterToolContext
): Promise<string> {
  try {
    let result: unknown;
    switch (name) {
      case 'list_classes':
        result = await listClasses(ctx);
        break;
      case 'get_class_grade_report':
        result = await getClassGradeReport(ctx, input);
        break;
      case 'get_student_grade_report':
        result = await getStudentGradeReport(ctx, input);
        break;
      case 'get_student_growth':
        result = await getStudentGrowth(ctx, input);
        break;
      case 'find_students_needing_attention':
        result = await findAttention(ctx, input);
        break;
      case 'get_submission_detail':
        result = await getSubmissionDetail(ctx, input);
        break;
      case 'list_growth_plans':
        result = await listGrowthPlans(ctx, input);
        break;
      case 'save_growth_plan':
        result = await saveGrowthPlan(ctx, input);
        break;
      default:
        return JSON.stringify({ error: `Unknown tool: ${name}` });
    }

    const serialized = JSON.stringify(result);
    if (serialized.length <= MAX_TOOL_RESULT_CHARS) return serialized;
    return JSON.stringify({
      truncated: true,
      totalCharacters: serialized.length,
      preview: serialized.slice(0, MAX_TOOL_RESULT_PREVIEW_CHARS),
      note: 'The tool result exceeded the Reporter context budget. Narrow the request before continuing.',
    });
  } catch (error) {
    return JSON.stringify({
      error:
        error instanceof z.ZodError
          ? 'Invalid tool input.'
          : 'Failed to run report.',
    });
  }
}
