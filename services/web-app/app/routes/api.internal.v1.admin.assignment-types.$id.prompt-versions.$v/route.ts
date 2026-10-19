import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';
import { gradingWorkspaceHandlers } from '~/utils/internal-grading-workspace-route.server';
export const loader = ({ request, params }: LoaderFunctionArgs) =>
  gradingWorkspaceHandlers.handle(
    'promptVersion',
    request,
    params.id,
    params.v
  );
export const action = ({ request, params }: ActionFunctionArgs) =>
  gradingWorkspaceHandlers.handle(
    'promptVersion',
    request,
    params.id,
    params.v
  );
