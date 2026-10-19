import { data as dataResponse, type ActionFunctionArgs } from 'react-router';
import { requireAdmin } from '~/utils/auth.server';
import {
  WorkspaceActionSchema,
  executeGradingWorkspaceAction,
} from '~/domain/ai-evaluation/grading-workspace-actions.server';

export async function action({ request }: ActionFunctionArgs) {
  await requireAdmin(request);
  const parsed = WorkspaceActionSchema.safeParse(
    Object.fromEntries(await request.formData())
  );
  if (!parsed.success)
    return dataResponse(
      { success: false, message: 'Complete every required evaluation field.' },
      { status: 400 }
    );
  return executeGradingWorkspaceAction(parsed.data, request);
}
