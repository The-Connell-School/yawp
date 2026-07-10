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
];

const classIdSchema = z.object({ classId: z.string().min(1) });
const studentSchema = z.object({ student: z.string().min(1) });

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

  const rows = await fetchScopedGradedRows({
    organizationId: ctx.organizationId,
    teacherMembershipId: ctx.membershipId,
    studentMembershipId: student.id,
  });
  const [summary] = summarizeStudentGrades(rows);

  return {
    student: { studentMembershipId: student.id, studentName: student.name },
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
  const { student: studentQuery } = studentSchema.parse(input);
  const resolved = await resolveStudent(ctx, studentQuery);
  if ('error' in resolved) return resolved;
  const { student } = resolved;

  const rows = await fetchScopedGradedRows({
    organizationId: ctx.organizationId,
    teacherMembershipId: ctx.membershipId,
    studentMembershipId: student.id,
  });

  return {
    student: { studentMembershipId: student.id, studentName: student.name },
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
