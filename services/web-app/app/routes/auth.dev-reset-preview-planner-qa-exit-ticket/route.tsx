import type { ActionFunctionArgs } from 'react-router';
import { resetPreviewPlannerQaExitTicketSubmission } from '../../../../../packages/prisma/scripts/seed-preview-planner-qa';
import { prisma } from '~/utils/db.server';
import { isLocalDevAuthEnabled } from '~/utils/local-dev-auth.server';
import {
  getPreviewAccessSeat,
  isPreviewAccessGateEnabled,
} from '~/utils/preview-access.server';

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }
  if (!isLocalDevAuthEnabled()) {
    return Response.json({ error: 'Dev reset is disabled.' }, { status: 403 });
  }
  if (isPreviewAccessGateEnabled() && !(await getPreviewAccessSeat(request))) {
    return Response.json(
      { error: 'Preview access code required.' },
      { status: 401 }
    );
  }

  try {
    await resetPreviewPlannerQaExitTicketSubmission(prisma);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to reset preview planner QA exit ticket.',
      },
      { status: 400 }
    );
  }
}
