/**
 * Library folders the teacher makes and fills (Kevin, Oct 23): new, rename,
 * delete, move a lesson in or out, and reorder a folder.
 */
import { data as dataResponse, type ActionFunctionArgs } from 'react-router';
import { parseFormData, validationError } from '@rvf/react-router';
import { z } from 'zod';
import { requireMutableRequest } from '~/utils/auth.server';
import { requireLessonPlannerAccess } from '~/utils/lesson-planner/lesson-planner-access.server';
import { getLessonPlannerReviewFlags } from '~/domain/feature-flags/feature-flags.server';
import {
  createFolder,
  deleteFolder,
  moveLesson,
  renameFolder,
  reorderFolder,
} from '~/domain/lesson-planner/lesson-folders.server';

const POST = z.object({
  intent: z.enum(['create', 'rename', 'delete', 'move', 'reorder']),
  folderId: z.string().optional(),
  title: z.string().max(200).optional(),
  conversationId: z.string().optional(),
  /** Comma-separated lesson ids, in their new order. */
  order: z.string().max(4000).optional(),
});

export async function action({ request }: ActionFunctionArgs) {
  await requireMutableRequest(request);
  const access = await requireLessonPlannerAccess(request);
  const flags = await getLessonPlannerReviewFlags(access.membership.organization.id);
  if (!flags.stackV3) return dataResponse({ error: 'Not found.' }, { status: 404 });
  const { error, data } = await parseFormData(request, POST);
  if (error) return validationError(error);
  const scope = { membershipId: access.membership.id, organizationId: access.membership.organization.id };
  const missing = () => dataResponse({ error: 'Not found.' }, { status: 404 });

  switch (data.intent) {
    case 'create':
      return dataResponse({ ok: true, folder: await createFolder(scope, data.title ?? '') });
    case 'rename':
      return data.folderId && (await renameFolder(scope, data.folderId, data.title ?? '')) ? dataResponse({ ok: true }) : missing();
    case 'delete':
      return data.folderId && (await deleteFolder(scope, data.folderId)) ? dataResponse({ ok: true }) : missing();
    case 'move':
      return data.conversationId && (await moveLesson(scope, data.conversationId, data.folderId || null))
        ? dataResponse({ ok: true })
        : missing();
    case 'reorder':
      return data.folderId &&
        (await reorderFolder(scope, data.folderId, (data.order ?? '').split(',').filter(Boolean)))
        ? dataResponse({ ok: true })
        : missing();
  }
}
