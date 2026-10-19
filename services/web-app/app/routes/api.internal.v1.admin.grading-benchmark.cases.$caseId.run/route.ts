import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';
import { gradingWorkspaceHandlers } from '~/utils/internal-grading-workspace-route.server';
export const loader = ({ request, params }: LoaderFunctionArgs) =>
  gradingWorkspaceHandlers.handle(
    'benchmarkRun',
    request,
    params.id,
    params.caseId
  );
export const action = ({ request, params }: ActionFunctionArgs) =>
  gradingWorkspaceHandlers.handle(
    'benchmarkRun',
    request,
    params.id,
    params.caseId
  );
