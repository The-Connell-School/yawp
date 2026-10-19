import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';
import { gradingWorkspaceHandlers } from '~/utils/internal-grading-workspace-route.server';
export const loader = ({ request, params }: LoaderFunctionArgs) =>
  gradingWorkspaceHandlers.handle(
    'case',
    request,
    params.id,
    params.suiteId,
    params.caseId
  );
export const action = ({ request, params }: ActionFunctionArgs) =>
  gradingWorkspaceHandlers.handle(
    'case',
    request,
    params.id,
    params.suiteId,
    params.caseId
  );
