import type { CaptureResult } from 'posthog-js';

/** Deliberately structural: no DOM text, input values, analytics properties or URL queries. */
export const FEEDBACK_CAPTURE_EVENTS = [
  '$pageview',
  '$pageleave',
  '$autocapture',
  'feedback_submitted',
  'custom_event',
] as const;
export type FeedbackCaptureEvent = (typeof FEEDBACK_CAPTURE_EVENTS)[number];
export type FeedbackAction =
  | { type: 'route'; path: string }
  | { type: 'click'; path: string; target: 'button' | 'link' }
  | { type: 'capture'; path: string; event: FeedbackCaptureEvent };

export function feedbackPath(value: string): string | null {
  if (
    !value.startsWith('/') ||
    value.startsWith('//') ||
    /[\\\s\u0000-\u001f]/.test(value) ||
    /%(?![\da-f]{2})/i.test(value)
  )
    return null;
  const url = new URL(value, 'https://feedback.invalid');
  if (
    (url.pathname !== '/app' && !url.pathname.startsWith('/app/')) ||
    url.pathname.length > 512
  )
    return null;
  return url.pathname;
}

export function createFeedbackContext() {
  const actions: FeedbackAction[] = [];
  const push = (action: FeedbackAction) => {
    actions.push(action);
    if (actions.length > 5) actions.shift();
  };
  return {
    route(url: string) {
      const path = feedbackPath(url);
      if (path) push({ type: 'route', path });
    },
    click(target: 'button' | 'link', url: string) {
      const path = feedbackPath(url);
      if (path) push({ type: 'click', path, target });
    },
    capture(name: string, url: string) {
      const path = feedbackPath(url);
      const event = FEEDBACK_CAPTURE_EVENTS.includes(
        name as FeedbackCaptureEvent
      )
        ? (name as FeedbackCaptureEvent)
        : 'custom_event';
      if (path) push({ type: 'capture', path, event });
    },
    snapshot: () => actions.map((action) => ({ ...action })),
  };
}

export type FeedbackAnalytics = {
  capture(event: string, properties: Record<string, unknown>): unknown;
};
export function captureSavedFeedback(
  analytics: FeedbackAnalytics | undefined,
  location: string,
  actions: FeedbackAction[]
) {
  try {
    analytics?.capture('feedback_submitted', {
      location,
      recent_actions: actions,
    });
  } catch {
    // Persistence has already succeeded. Analytics must never change the saved state.
  }
}

/** PostHog adds current/referrer URLs and persisted properties after capture().
 * Restrict the final feedback event too, including top-level person properties.
 * Other existing analytics retain their behavior.
 */
export function sanitizeDemoFeedbackEvent(
  event: CaptureResult | null
): CaptureResult | null {
  if (!event || event.event !== 'feedback_submitted') return event;
  const path =
    typeof event.properties.location === 'string'
      ? feedbackPath(event.properties.location)
      : null;
  if (!path) return null;
  const context = createFeedbackContext();
  const actions: unknown = event.properties.recent_actions;
  if (Array.isArray(actions))
    for (const action of actions.slice(-5)) {
      if (!action || typeof action.path !== 'string') continue;
      if (action.type === 'route') context.route(action.path);
      if (
        action.type === 'click' &&
        (action.target === 'button' || action.target === 'link')
      )
        context.click(action.target, action.path);
      if (action.type === 'capture' && typeof action.event === 'string')
        context.capture(action.event, action.path);
    }
  const properties: Record<string, unknown> = {
    location: path,
    $current_url: path,
    $pathname: path,
    recent_actions: context.snapshot(),
  };
  for (const key of [
    'distinct_id',
    '$device_id',
    '$user_id',
    '$session_id',
    '$window_id',
    '$is_identified',
    '$process_person_profile',
    '$lib',
    '$lib_version',
  ]) {
    if (event.properties[key] !== undefined)
      properties[key] = event.properties[key];
  }
  return {
    uuid: event.uuid,
    event: event.event,
    timestamp: event.timestamp,
    properties,
  };
}
