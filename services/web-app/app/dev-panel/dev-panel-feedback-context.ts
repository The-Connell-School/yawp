import type { FeedbackCaptureEvent } from '~/utils/demo-feedback-context';
import { FEEDBACK_CAPTURE_EVENTS } from '~/utils/demo-feedback-context';
import { devPanelFeedbackPath } from './dev-panel-feedback-path';

export type DevPanelFeedbackAction =
  | { type: 'route'; path: string }
  | { type: 'click'; path: string; target: 'button' | 'link' }
  | { type: 'capture'; path: string; event: FeedbackCaptureEvent };

export function createDevPanelFeedbackContext() {
  const actions: DevPanelFeedbackAction[] = [];
  const push = (action: DevPanelFeedbackAction) => {
    actions.push(action);
    if (actions.length > 5) actions.shift();
  };
  return {
    route(url: string) {
      const path = devPanelFeedbackPath(url);
      if (path) push({ type: 'route', path });
    },
    click(target: 'button' | 'link', url: string) {
      const path = devPanelFeedbackPath(url);
      if (path) push({ type: 'click', path, target });
    },
    capture(name: string, url: string) {
      const path = devPanelFeedbackPath(url);
      const event = FEEDBACK_CAPTURE_EVENTS.includes(name as FeedbackCaptureEvent)
        ? (name as FeedbackCaptureEvent)
        : 'custom_event';
      if (path) push({ type: 'capture', path, event });
    },
    snapshot: () => actions.map((action) => ({ ...action })),
  };
}
