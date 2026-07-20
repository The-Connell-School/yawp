import { Prisma } from '@app/prisma';
import { data as dataResponse, type ActionFunctionArgs } from 'react-router';
import {
  aggregateRubricPerformance,
  type GradedSubmissionInput,
} from '~/domain/assignment-insights/aggregate-rubric-performance';
import { generateClassInsight } from '~/domain/assignment-insights/class-insight-synthesis.server';
import {
  buildDifferentiation,
  type DifferentiationInput,
} from '~/domain/assignment-insights/differentiate-students';
import { prisma } from '~/utils/db.server';
import { canManageGrades, getGradingActor } from '~/utils/grading-auth.server';

function classLabel(klass: {
  grade: string | null;
  period: string | null;
}): string | null {
  const parts = [
    klass.grade ? `Grade ${klass.grade}` : null,
    klass.period ? `Period ${klass.period}` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
}

export async function action({ request }: ActionFunctionArgs) {
  const actor = await getGradingActor(request);
  if (!canManageGrades(actor)) {
    return dataResponse(
      { success: false, message: 'Only teachers can generate class insights.' },
      { status: 403 }
    );
  }

  const form = await request.formData();
  const classAssignmentId = form.get('classAssignmentId');
  if (typeof classAssignmentId !== 'string' || !classAssignmentId.trim()) {
    return dataResponse(
      { success: false, message: 'A class assignment is required.' },
      { status: 400 }
    );
  }

  // Authorization: the actor must teach this class (admins bypass the scope).
  const classAssignment = await prisma.classAssignment.findFirst({
    where: {
      id: classAssignmentId,
      ...(actor.isAdmin
        ? {}
        : { class: { teachers: { some: { id: actor.membershipId } } } }),
    },
    select: {
      id: true,
      assignment: { select: { title: true } },
      class: {
        select: {
          grade: true,
          period: true,
          school: {
            select: {
              organization: { select: { classInsightsEnabled: true } },
            },
          },
        },
      },
    },
  });
  if (!classAssignment) {
    return dataResponse(
      { success: false, message: 'Assignment not found.' },
      { status: 404 }
    );
  }
  if (!classAssignment.class.school.organization.classInsightsEnabled) {
    return dataResponse(
      { success: false, message: 'Class insights are not enabled.' },
      { status: 404 }
    );
  }

  // Latest graded submission per student document in this class-assignment.
  // Student identity is carried for the deterministic differentiation pass
  // only — the LLM still sees aggregate data with no names.
  const documents = await prisma.document.findMany({
    where: { classAssignmentId: classAssignment.id, deletedAt: null },
    select: {
      id: true,
      membership: {
        select: { user: { select: { name: true, email: true } } },
      },
      submissions: {
        where: { gradedAt: { not: null } },
        orderBy: { submittedAt: 'desc' },
        take: 1,
        select: { id: true, rubricScores: true, overallComment: true },
      },
    },
  });

  const inputs: DifferentiationInput[] = documents.flatMap((doc) => {
    const submission = doc.submissions[0];
    if (!submission) return [];
    return [
      {
        submissionId: submission.id,
        studentName:
          doc.membership?.user?.name?.trim() ||
          doc.membership?.user?.email?.trim() ||
          null,
        href: `/app/submissions/${submission.id}`,
        rubricScores:
          submission.rubricScores as GradedSubmissionInput['rubricScores'],
        overallComment: submission.overallComment,
      },
    ];
  });

  if (inputs.length === 0) {
    return dataResponse(
      {
        success: false,
        message:
          'No graded submissions yet. Grade a few submissions first, then generate class insights.',
      },
      { status: 400 }
    );
  }

  const aggregate = aggregateRubricPerformance(inputs);

  const generatedAt = new Date();
  let generated: Awaited<ReturnType<typeof generateClassInsight>>;
  try {
    generated = await generateClassInsight({
      aggregate,
      context: {
        assignmentTitle: classAssignment.assignment.title,
        className: classLabel(classAssignment.class),
      },
      metadata: { classAssignmentId: classAssignment.id },
    });
  } catch {
    await prisma.classAssignmentInsight.upsert({
      where: { classAssignmentId: classAssignment.id },
      create: {
        classAssignmentId: classAssignment.id,
        status: 'failed',
        submissionCount: aggregate.submissionCount,
        generatedByMembershipId: actor.membershipId,
        generatedAt,
      },
      update: {
        status: 'failed',
        summaryJson: Prisma.JsonNull,
        submissionCount: aggregate.submissionCount,
        generatedByMembershipId: actor.membershipId,
        generatedAt,
      },
    });
    return dataResponse(
      {
        success: false,
        message:
          'Class insights are temporarily unavailable. Please try again.',
      },
      { status: 502 }
    );
  }

  const { summary, model } = generated;
  const baseRow = {
    model,
    submissionCount: aggregate.submissionCount,
    generatedByMembershipId: actor.membershipId,
    generatedAt,
  };

  if (!summary) {
    await prisma.classAssignmentInsight.upsert({
      where: { classAssignmentId: classAssignment.id },
      create: {
        classAssignmentId: classAssignment.id,
        status: 'failed',
        ...baseRow,
      },
      update: { status: 'failed', summaryJson: Prisma.JsonNull, ...baseRow },
    });
    return dataResponse(
      {
        success: false,
        message:
          'The assistant returned an unusable summary. Please try again.',
      },
      { status: 502 }
    );
  }

  // Differentiation starting points are computed deterministically from the
  // rubric scores and stored alongside the LLM summary so they hydrate from
  // the cache with it.
  const differentiation = buildDifferentiation(inputs);
  const enrichedSummary = differentiation
    ? { ...summary, differentiation }
    : summary;

  const summaryJson = enrichedSummary as unknown as Prisma.InputJsonValue;
  await prisma.classAssignmentInsight.upsert({
    where: { classAssignmentId: classAssignment.id },
    create: {
      classAssignmentId: classAssignment.id,
      status: 'ready',
      summaryJson,
      ...baseRow,
    },
    update: { status: 'ready', summaryJson, ...baseRow },
  });

  return dataResponse({
    success: true,
    insight: {
      classAssignmentId: classAssignment.id,
      status: 'ready' as const,
      model,
      submissionCount: aggregate.submissionCount,
      generatedAt: generatedAt.toISOString(),
      summary: enrichedSummary,
    },
  });
}
