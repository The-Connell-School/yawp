import type { ActionFunctionArgs } from 'react-router';
import { assertDevPanelRoute } from '~/dev-panel/dev-panel-route-guard.server';
import { isBlackboardLtiMockUiEnabled } from '~/utils/blackboard-lti-mock-ui.server';
import {
  getPreviewAccessSeat,
  isPreviewDevLoginAccessCodeRequired,
} from '~/utils/preview-access.server';

export async function action({ request }: ActionFunctionArgs) {
  const blocked = await assertDevPanelRoute(request);
  if (blocked) return blocked;
  if (!isBlackboardLtiMockUiEnabled()) {
    return Response.json(
      { error: 'Blackboard mock is not available here.' },
      { status: 404 }
    );
  }
  if (isPreviewDevLoginAccessCodeRequired()) {
    const seat = await getPreviewAccessSeat(request);
    if (!seat) {
      return Response.json(
        {
          error:
            'Enter a preview access code before launching Blackboard.',
        },
        { status: 401 }
      );
    }
  }
  const body = await request.json().catch(() => ({}));
  const role = body?.role === 'student' ? 'student' : 'teacher';
  const launchUrl = `/dev/blackboard-lti-mock/?devPanelRole=${role}`;
  return Response.json({ ok: true, launchUrl });
}
