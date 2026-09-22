import { data as dataResponse, type ActionFunctionArgs } from 'react-router';
import { requireMembership, requireOwner } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';

/**
 * Rubrics are database-managed and read-only in the admin UI. This route only
 * changes which existing rubric an assignment type uses.
 */
export async function action({ request }: ActionFunctionArgs) {
  const user = await requireOwner(request);
  await requireMembership(request, user.id);

  const formData = await request.formData();
  const intent = formData.get('intent')?.toString();

  if (intent === 'select') {
    const assignmentTypeId = formData.get('assignmentTypeId')?.toString();
    const rubricId = formData.get('rubricId')?.toString() || null;

    if (!assignmentTypeId) {
      return dataResponse(
        { error: 'Missing assignment type.' },
        { status: 400 }
      );
    }

    if (rubricId) {
      const exists = await prisma.rubric.findUnique({
        where: { id: rubricId },
        select: { id: true },
      });
      if (!exists) {
        return dataResponse(
          { error: 'That rubric no longer exists.' },
          { status: 404 }
        );
      }
    }

    await prisma.assignmentType.update({
      where: { id: assignmentTypeId },
      data: { rubricId },
    });

    return dataResponse({ status: 'success', rubricId });
  }

  return dataResponse({ error: 'Unknown action.' }, { status: 400 });
}
