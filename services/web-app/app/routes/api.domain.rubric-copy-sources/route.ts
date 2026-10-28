import { data as dataResponse, type LoaderFunctionArgs } from 'react-router';
import { listCopyableRubricSources } from '~/domain/assignment-types/rubric-copy.server';
import { requireAdmin } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import { buildSafeErrorForLog } from '~/utils/server-error-request-context.server';

export async function loader({ request }: LoaderFunctionArgs) {
  await requireAdmin(request);

  try {
    const excludeId = new URL(request.url).searchParams.get('excludeId');
    const sources = await listCopyableRubricSources(prisma, {
      excludeAssignmentTypeId: excludeId,
    });

    return dataResponse({ success: true, sources });
  } catch (error) {
    console.error('rubric_copy_sources_load_failed', {
      error: buildSafeErrorForLog(error),
    });
    return dataResponse(
      {
        success: false,
        message: 'Could not load assignment types to copy from.',
        sources: [],
      },
      { status: 500 }
    );
  }
}
