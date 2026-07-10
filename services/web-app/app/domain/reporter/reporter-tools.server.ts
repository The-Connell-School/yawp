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
import {
  buildGrowthSeries,
  summarizeStudentGrades,
  type GradedSubmissionRow,
} from './reporter-report';

export type ReporterToolContext = {
  /** The calling teacher's OrgMembership id. */
  membershipId: string;
  /** The calling teacher's organization id. */
  organizationId: string;
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
        studentMembershipId: {
          type: 'string',
          description: "The student's OrgMembership id.",
        },
      },
      required: ['studentMembershipId'],
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
        studentMembershipId: {
          type: 'string',
          description: "The student's OrgMembership id.",
        },
      },
      required: ['studentMembershipId'],
      additionalProperties: false,
    },
  },
];

const classIdSchema = z.object({ classId: z.string().min(1) });
const studentSchema = z.object({ studentMembershipId: z.string().min(1) });

/**
 * Fetch released, graded submissions for a set of classes taught by the
 * teacher, normalized into the shape the pure report functions expect.
 */
async function fetchScopedGradedRows(where: {
  organizationId: string;
  teacherMembershipId: string;
  classId?: string;
  studentMembershipId?: string;
}): Promise<GradedSubmissionRow[]> {
  const submissions = await prisma.submission.findMany({
    where: {
      releasedAt: { not: null },
      archivedAt: null,
      document: {
        ...(where.studentMembershipId
          ? { membershipId: where.studentMembershipId }
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
    orderBy: { submittedAt: 'asc' },
  });

  return submissions.map((submission) => ({
    submissionId: submission.id,
    studentMembershipId: submission.document.membershipId,
    studentName: submission.document.membership.user.name ?? 'Unknown student',
    assignmentTitle:
      submission.document.classAssignment?.assignment.title ??
      'Untitled assignment',
    submittedAt: submission.submittedAt,
    numericPercentage: submission.numericPercentage,
    letterGrade: submission.letterGrade,
  }));
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
  });

  return {
    classes: classes.map((klass) => ({
      classId: klass.id,
      title: klass.title ?? `${klass.grade} · Period ${klass.period}`,
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

  const rows = await fetchScopedGradedRows({
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
      title: klass.title ?? `${klass.grade} · Period ${klass.period}`,
      grade: klass.grade,
      period: klass.period,
    },
    gradedSubmissionCount: rows.length,
    classAveragePercentage,
    students,
  };
}

/**
 * Confirm the student shares at least one class with the teacher before
 * returning any of their data.
 */
async function assertStudentIsVisible(
  ctx: ReporterToolContext,
  studentMembershipId: string
) {
  return prisma.orgMembership.findFirst({
    where: {
      id: studentMembershipId,
      role: 'STUDENT',
      organizationId: ctx.organizationId,
      classesAsStudent: {
        some: { teachers: { some: { id: ctx.membershipId } } },
      },
    },
    select: { id: true, user: { select: { name: true } } },
  });
}

async function getStudentGradeReport(ctx: ReporterToolContext, input: unknown) {
  const { studentMembershipId } = studentSchema.parse(input);
  const student = await assertStudentIsVisible(ctx, studentMembershipId);
  if (!student) {
    return { error: 'Student not found in any class you teach.' };
  }

  const rows = await fetchScopedGradedRows({
    organizationId: ctx.organizationId,
    teacherMembershipId: ctx.membershipId,
    studentMembershipId,
  });
  const [summary] = summarizeStudentGrades(rows);

  return {
    student: {
      studentMembershipId,
      studentName: student.user.name ?? 'Unknown student',
    },
    averagePercentage: summary?.averagePercentage ?? null,
    latestLetterGrade: summary?.latestLetterGrade ?? null,
    submissions: rows.map((row) => ({
      submissionId: row.submissionId,
      assignmentTitle: row.assignmentTitle,
      submittedAt: row.submittedAt.toISOString(),
      numericPercentage: row.numericPercentage,
      letterGrade: row.letterGrade,
    })),
  };
}

async function getStudentGrowth(ctx: ReporterToolContext, input: unknown) {
  const { studentMembershipId } = studentSchema.parse(input);
  const student = await assertStudentIsVisible(ctx, studentMembershipId);
  if (!student) {
    return { error: 'Student not found in any class you teach.' };
  }

  const rows = await fetchScopedGradedRows({
    organizationId: ctx.organizationId,
    teacherMembershipId: ctx.membershipId,
    studentMembershipId,
  });

  return {
    student: {
      studentMembershipId,
      studentName: student.user.name ?? 'Unknown student',
    },
    ...buildGrowthSeries(rows),
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
    switch (name) {
      case 'list_classes':
        return JSON.stringify(await listClasses(ctx));
      case 'get_class_grade_report':
        return JSON.stringify(await getClassGradeReport(ctx, input));
      case 'get_student_grade_report':
        return JSON.stringify(await getStudentGradeReport(ctx, input));
      case 'get_student_growth':
        return JSON.stringify(await getStudentGrowth(ctx, input));
      default:
        return JSON.stringify({ error: `Unknown tool: ${name}` });
    }
  } catch (error) {
    return JSON.stringify({
      error:
        error instanceof z.ZodError
          ? 'Invalid tool input.'
          : 'Failed to run report.',
    });
  }
}
