import { data as dataResponse, type ActionFunctionArgs } from 'react-router';
import { generateClassAssignmentInsight } from '~/domain/assignment-insights/class-insight-generation.server';
import { prisma } from '~/utils/db.server';
import { canManageGrades, getGradingActor } from '~/utils/grading-auth.server';

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

  const authorized = await prisma.classAssignment.findFirst({
    where: {
      id: classAssignmentId,
      class: {
        school: { organizationId: actor.organizationId },
        ...(actor.isAdmin
          ? {}
          : { teachers: { some: { id: actor.membershipId } } }),
      },
    },
    select: { id: true },
  });

  if (!authorized) {
    return dataResponse(
      { success: false, message: 'Assignment not found.' },
      { status: 404 }
    );
  }

  const result = await generateClassAssignmentInsight({
    classAssignmentId,
    organizationId: actor.organizationId,
    generatedByMembershipId: actor.membershipId,
  });

  if (!result.success) {
    return dataResponse(
      {
        success: false,
        message: result.message,
        ...(result.cooldownUntil
          ? { cooldownUntil: result.cooldownUntil }
          : {}),
      },
      {
        status: result.status,
        ...(result.retryAfterSeconds
          ? { headers: { 'Retry-After': String(result.retryAfterSeconds) } }
          : {}),
      }
    );
  }

  return dataResponse({
    success: true,
    insight: result.insight,
  });
}
