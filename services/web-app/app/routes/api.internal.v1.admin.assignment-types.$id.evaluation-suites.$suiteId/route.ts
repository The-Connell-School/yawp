import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';
import { gradingWorkspaceHandlers } from '~/utils/internal-grading-workspace-route.server';
export const loader = ({ request, params }: LoaderFunctionArgs) =>
  gradingWorkspaceHandlers.handle('suite', request, params.id, params.suiteId);
export const action = ({ request, params }: ActionFunctionArgs) =>
  gradingWorkspaceHandlers.handle('suite', request, params.id, params.suiteId);
