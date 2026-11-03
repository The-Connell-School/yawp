import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';
import { gradingWorkspaceHandlers } from '~/utils/internal-grading-workspace-route.server';
export const loader = ({ request, params }: LoaderFunctionArgs) =>
  gradingWorkspaceHandlers.handle('run', request, params.id, params.runId);
export const action = ({ request, params }: ActionFunctionArgs) =>
  gradingWorkspaceHandlers.handle('run', request, params.id, params.runId);
