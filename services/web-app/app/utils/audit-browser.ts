import { useEffect } from 'react';
import { useLocation, useNavigationType } from 'react-router';
import posthog from 'posthog-js';

type BrowserAuditEventInput = {
  eventType: string;
  occurredAt?: string;
  userId?: string | null;
  profileId?: string | null;
  sessionId?: string | null;
  editorSessionId?: string | null;
  documentId?: string | null;
  path?: string | null;
  route?: string | null;
  method?: string | null;
  statusCode?: number | null;
  success?: boolean | null;
  payload?: unknown;
  metadata?: unknown;
};

type BrowserAuditContext = {
  userId: string | null;
  profileId: string | null;
};

const AUDIT_ENDPOINT = '/api/model/audit-events';
const MAX_BATCH_SIZE = 20;
const FLUSH_DELAY_MS = 1200;

let browserAuditContext: BrowserAuditContext = {
  userId: null,
  profileId: null,
};
let queuedEvents: BrowserAuditEventInput[] = [];
let flushTimer: number | null = null;

function getCurrentPath() {
  if (typeof window === 'undefined') return null;
  return `${window.location.pathname}${window.location.search}`;
}

function getReplayUrl() {
  try {
    return posthog.get_session_replay_url?.({ withTimestamp: true }) ?? null;
  } catch {
    return null;
  }
}

function normalizeBrowserAuditEvent(
  event: BrowserAuditEventInput
): BrowserAuditEventInput {
  const replayUrl = getReplayUrl();
  const path = event.path ?? getCurrentPath();
  const metadata =
    replayUrl == null
      ? event.metadata
      : {
          ...(typeof event.metadata === 'object' && event.metadata
            ? (event.metadata as Record<string, unknown>)
            : {}),
          replayUrl,
        };

  return {
    occurredAt: event.occurredAt ?? new Date().toISOString(),
    userId: event.userId ?? browserAuditContext.userId,
    profileId: event.profileId ?? browserAuditContext.profileId,
    documentId: event.documentId ?? null,
    editorSessionId: event.editorSessionId ?? null,
    sessionId: event.sessionId ?? null,
    path,
    route: event.route ?? path,
    method: event.method ?? null,
    statusCode: event.statusCode ?? null,
    success: event.success ?? null,
    eventType: event.eventType,
    payload: event.payload,
    metadata,
  };
}

async function postAuditEvents(
  events: BrowserAuditEventInput[],
  { useBeacon = false }: { useBeacon?: boolean } = {}
) {
  if (typeof window === 'undefined' || events.length === 0) return;

  const body = JSON.stringify({ events });

  if (useBeacon && typeof navigator !== 'undefined' && navigator.sendBeacon) {
    const payload = new Blob([body], { type: 'application/json' });
    const sent = navigator.sendBeacon(AUDIT_ENDPOINT, payload);
    if (sent) return;
  }

  await fetch(AUDIT_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    keepalive: useBeacon,
    credentials: 'include',
  }).catch(() => {});
}

export async function flushBrowserAuditEvents({
  useBeacon = false,
}: { useBeacon?: boolean } = {}) {
  if (queuedEvents.length === 0) return;

  const events = queuedEvents;
  queuedEvents = [];

  if (flushTimer != null && typeof window !== 'undefined') {
    window.clearTimeout(flushTimer);
    flushTimer = null;
  }

  await postAuditEvents(events, { useBeacon });
}

export function queueBrowserAuditEvent(
  event: BrowserAuditEventInput,
  {
    flush = false,
    useBeacon = false,
  }: {
    flush?: boolean;
    useBeacon?: boolean;
  } = {}
) {
  if (typeof window === 'undefined') return;

  queuedEvents.push(normalizeBrowserAuditEvent(event));

  if (queuedEvents.length >= MAX_BATCH_SIZE || flush) {
    void flushBrowserAuditEvents({ useBeacon });
    return;
  }

  if (flushTimer != null) return;
  flushTimer = window.setTimeout(() => {
    flushTimer = null;
    void flushBrowserAuditEvents();
  }, FLUSH_DELAY_MS);
}

export function BrowserAuditTracker({
  userId,
  profileId,
}: {
  userId?: string | null;
  profileId?: string | null;
}) {
  const location = useLocation();
  const navigationType = useNavigationType();

  useEffect(() => {
    browserAuditContext = {
      userId: userId ?? null,
      profileId: profileId ?? null,
    };
  }, [profileId, userId]);

  useEffect(() => {
    if (location.pathname.includes('/documents/')) {
      queueBrowserAuditEvent({
        eventType: 'page_view',
        path: `${location.pathname}${location.search}`,
        metadata: {
          navigationType,
        },
      });
    }
  }, [location.pathname, location.search, navigationType]);

  useEffect(() => {
    const onPageHide = () => {
      queueBrowserAuditEvent(
        {
          eventType: 'page_leave',
        },
        { flush: true, useBeacon: true }
      );
    };

    const onError = (event: ErrorEvent) => {
      queueBrowserAuditEvent(
        {
          eventType: 'client.runtime.error',
          payload: {
            message: event.message,
            filename: event.filename,
            lineno: event.lineno,
            colno: event.colno,
          },
        },
        { flush: true }
      );
    };

    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      queueBrowserAuditEvent(
        {
          eventType: 'client.runtime.rejection',
          payload: {
            reason:
              event.reason instanceof Error
                ? event.reason.message
                : String(event.reason),
          },
        },
        { flush: true }
      );
    };

    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('beforeunload', onPageHide);
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onUnhandledRejection);

    return () => {
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('beforeunload', onPageHide);
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onUnhandledRejection);
    };
  }, []);

  return null;
}
