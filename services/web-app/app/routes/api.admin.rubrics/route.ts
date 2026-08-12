import { data as dataResponse, type ActionFunctionArgs } from 'react-router';
import { requireMembership, requireOwner } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import { parseRubricSchema } from '~/domain/rubrics/rubric-schema';
import { upsertRubric } from '~/domain/rubrics/rubric-library.server';

/**
 * Rubrics are pasted whole and picked per assignment type. Both actions are
 * admin-only and neither edits a rubric in place: pasting the same `name`
 * again replaces that rubric everywhere it is used, which is what makes moving
 * one between environments a promotion rather than a fork.
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
      return dataResponse({ error: 'Missing assignment type.' }, { status: 400 });
    }

    if (rubricId) {
      const exists = await prisma.rubric.findUnique({
        where: { id: rubricId },
        select: { id: true },
      });
      if (!exists) {
        return dataResponse({ error: 'That rubric no longer exists.' }, { status: 404 });
      }
    }

    await prisma.assignmentType.update({
      where: { id: assignmentTypeId },
      data: { rubricId },
    });

    return dataResponse({ status: 'success', rubricId });
  }

  if (intent === 'create') {
    const raw = formData.get('schemaJson')?.toString() ?? '';
    const title = formData.get('title')?.toString() ?? '';
    const name = formData.get('name')?.toString() ?? '';

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(raw);
    } catch {
      return dataResponse({ error: 'That is not valid JSON.' }, { status: 400 });
    }

    // A label typed in the form wins over one inside the JSON, so an admin can
    // paste the same rubric under a new name deliberately.
    const withIdentity =
      parsedJson && typeof parsedJson === 'object' && !Array.isArray(parsedJson)
        ? {
            ...(parsedJson as Record<string, unknown>),
            ...(name.trim() ? { name: name.trim() } : {}),
            ...(title.trim() ? { title: title.trim() } : {}),
          }
        : parsedJson;

    const parsed = parseRubricSchema(withIdentity);
    if (!parsed.ok) {
      return dataResponse({ error: parsed.error }, { status: 400 });
    }

    const rubric = await upsertRubric(parsed.schema, title);
    return dataResponse({ status: 'success', rubricId: rubric.id });
  }

  return dataResponse({ error: 'Unknown action.' }, { status: 400 });
}
