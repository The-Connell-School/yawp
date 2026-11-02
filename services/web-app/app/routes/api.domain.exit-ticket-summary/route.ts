import { data as dataResponse, type ActionFunctionArgs } from 'react-router';
import { EXIT_TICKET_CLASS_SUMMARY_FLAG } from '~/domain/feature-flags/feature-flags';
import { isFeatureFlagEnabled } from '~/domain/feature-flags/feature-flags.server';
import { generateExitTicketClassSummary } from '~/domain/assignment-types/exit-ticket-class-summary.server';
import { prisma } from '~/utils/db.server';
import { canManageGrades, getGradingActor } from '~/utils/grading-auth.server';

/**
 * Summarize one class's exit tickets (flag `exit-ticket-class-summary`).
 * Authorized like the class insight: a teacher of the class, or an admin of
 * its organization. Answers with the stored summary when nothing is new.
 */
export async function action({ request }: ActionFunctionArgs) {
  const actor = await getGradingActor(request);
  if (!canManageGrades(actor)) {
    return dataResponse(
      { success: false, message: 'Only teachers can summarize exit tickets.' },
      { status: 403 }
    );
  }
  if (
    !(await isFeatureFlagEnabled(
      EXIT_TICKET_CLASS_SUMMARY_FLAG,
      actor.organizationId
    ))
  ) {
    return dataResponse(
      { success: false, message: 'Not found.' },
      { status: 404 }
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
      { success: false, message: 'Exit ticket not found.' },
      { status: 404 }
    );
  }

  const result = await generateExitTicketClassSummary({
    classAssignmentId,
    organizationId: actor.organizationId,
    membershipId: actor.membershipId,
  });
  if (!result.success) {
    return dataResponse(
      { success: false, message: result.message },
      {
        status: result.status,
        ...(result.retryAfterSeconds
          ? { headers: { 'Retry-After': String(result.retryAfterSeconds) } }
          : {}),
      }
    );
  }
  return dataResponse({ success: true, summary: result.summary });
}
