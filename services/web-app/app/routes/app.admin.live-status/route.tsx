import { useEffect, useRef, useState } from 'react';
import {
  data as dataResponse,
  type LoaderFunctionArgs,
  useLoaderData,
} from 'react-router';
import { Badge } from '~/components/ui/badge';
import { requireAdmin } from '~/utils/auth.server';
import type { BreadcrumbHandle } from '~/utils/breadcrumb';

const POLL_INTERVAL_MS = 2_000;
const EVENT_LIMIT = 6;

type LiveStatusPayload = {
  status: 'ok' | 'degraded';
  serverTime: string;
  runtime: {
    uptimeSeconds: number;
    nodeVersion: string;
    memory: {
      rssMb: number;
      heapUsedMb: number;
      heapTotalMb: number;
    };
  };
  database:
    | {
        status: 'ok';
        latencyMs: number;
      }
    | {
        status: 'error';
        latencyMs: number;
        error: string;
      };
};

type PollEvent = {
  id: number;
  tone: 'ok' | 'warning' | 'error';
  label: string;
  detail: string;
};

type PollState = {
  status: 'connecting' | 'reachable' | 'degraded' | 'unreachable';
  payload: LiveStatusPayload | null;
  latencyMs: number | null;
  lastCheckedAt: string | null;
  pollCount: number;
  events: PollEvent[];
};

export const handle: BreadcrumbHandle = { breadcrumb: 'Live Status' };

export async function loader({ request }: LoaderFunctionArgs) {
  await requireAdmin(request);
  return dataResponse({ pollIntervalMs: POLL_INTERVAL_MS });
}

function nowMs() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function formatLocalTime(value: string | null) {
  if (!value) return 'Pending';
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(value));
}

function formatUptime(seconds: number | undefined) {
  if (typeof seconds !== 'number') return 'Pending';

  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function trimEvents(events: PollEvent[]) {
  return events.slice(0, EVENT_LIMIT);
}

async function fetchLiveStatus(signal: AbortSignal) {
  const startedAt = nowMs();
  const response = await fetch('/api/admin/live-status', {
    headers: { Accept: 'application/json' },
    signal,
  });

  if (!response.ok) {
    throw new Error(`Status check failed with HTTP ${response.status}`);
  }

  const payload = (await response.json()) as LiveStatusPayload;
  return {
    payload,
    latencyMs: Math.round(nowMs() - startedAt),
  };
}

function statusCopy(state: PollState) {
  if (state.status === 'reachable') return 'Backend reachable';
  if (state.status === 'degraded') return 'Backend degraded';
  if (state.status === 'unreachable') return 'Backend unreachable';
  return 'Connecting to backend';
}

function statusBadgeVariant(state: PollState) {
  if (state.status === 'reachable') return 'success' as const;
  if (state.status === 'degraded') return 'warning-soft' as const;
  if (state.status === 'unreachable') return 'destructive' as const;
  return 'secondary' as const;
}

function useLiveStatus(pollIntervalMs: number) {
  const eventId = useRef(0);
  const [state, setState] = useState<PollState>({
    status: 'connecting',
    payload: null,
    latencyMs: null,
    lastCheckedAt: null,
    pollCount: 0,
    events: [],
  });

  useEffect(() => {
    let stopped = false;
    let inFlight: AbortController | null = null;

    async function poll() {
      if (inFlight) return;

      const controller = new AbortController();
      inFlight = controller;

      try {
        const { payload, latencyMs } = await fetchLiveStatus(controller.signal);
        if (stopped) return;

        const checkedAt = new Date().toISOString();
        const nextStatus = payload.status === 'ok' ? 'reachable' : 'degraded';
        const event: PollEvent = {
          id: eventId.current++,
          tone: nextStatus === 'reachable' ? 'ok' : 'warning',
          label:
            nextStatus === 'reachable'
              ? 'Backend responded'
              : 'Backend reported degraded health',
          detail: `${formatLocalTime(checkedAt)} - ${latencyMs}ms`,
        };

        setState((previous) => ({
          status: nextStatus,
          payload,
          latencyMs,
          lastCheckedAt: checkedAt,
          pollCount: previous.pollCount + 1,
          events: trimEvents([event, ...previous.events]),
        }));
      } catch (error) {
        if (stopped || controller.signal.aborted) return;

        const checkedAt = new Date().toISOString();
        const message =
          error instanceof Error ? error.message : 'Status check failed';
        const event: PollEvent = {
          id: eventId.current++,
          tone: 'error',
          label: 'Poll failed',
          detail: `${formatLocalTime(checkedAt)} - ${message}`,
        };

        setState((previous) => ({
          ...previous,
          status: 'unreachable',
          lastCheckedAt: checkedAt,
          pollCount: previous.pollCount + 1,
          events: trimEvents([event, ...previous.events]),
        }));
      } finally {
        if (inFlight === controller) inFlight = null;
      }
    }

    void poll();
    const intervalId = window.setInterval(poll, pollIntervalMs);

    return () => {
      stopped = true;
      window.clearInterval(intervalId);
      inFlight?.abort();
    };
  }, [pollIntervalMs]);

  return state;
}

function Metric({
  label,
  value,
  testId,
}: {
  label: string;
  value: React.ReactNode;
  testId?: string;
}) {
  return (
    <div role="listitem" className="min-w-0 rounded-lg border bg-muted/20 p-3">
      <p className="truncate text-sm font-medium text-muted-foreground">
        {label}
      </p>
      <p
        data-testid={testId}
        className="mt-1 min-w-0 truncate font-mono text-sm tabular-nums text-foreground"
      >
        {value}
      </p>
    </div>
  );
}

export default function LiveStatusRoute() {
  const { pollIntervalMs } = useLoaderData<typeof loader>();
  const state = useLiveStatus(pollIntervalMs);
  const payload = state.payload;
  const database = payload?.database;

  return (
    <div className="p-3 sm:p-5">
      <div className="max-w-5xl space-y-5">
        <section
          aria-labelledby="live-status-summary"
          className="rounded-lg border bg-background p-4 shadow-sm"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h2
                id="live-status-summary"
                className="text-lg font-semibold leading-tight"
              >
                Backend heartbeat
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Last checked {formatLocalTime(state.lastCheckedAt)}
              </p>
            </div>
            <div aria-live="polite" className="shrink-0">
              <Badge variant={statusBadgeVariant(state)}>
                {statusCopy(state)}
              </Badge>
            </div>
          </div>

          <div
            role="list"
            className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
          >
            <Metric
              label="Server time"
              value={payload?.serverTime ?? 'Pending'}
              testId="live-status-server-time"
            />
            <Metric
              label="Round trip"
              value={
                state.latencyMs === null ? 'Pending' : `${state.latencyMs}ms`
              }
            />
            <Metric
              label="Database"
              value={
                database
                  ? `${database.status} - ${database.latencyMs}ms`
                  : 'Pending'
              }
            />
            <Metric
              label="Uptime"
              value={formatUptime(payload?.runtime.uptimeSeconds)}
            />
          </div>
        </section>

        <section
          aria-labelledby="live-status-runtime"
          className="rounded-lg border bg-background p-4 shadow-sm"
        >
          <div className="flex flex-col gap-1">
            <h2
              id="live-status-runtime"
              className="text-base font-semibold leading-tight"
            >
              Runtime
            </h2>
            <p className="text-sm text-muted-foreground">
              {payload?.runtime.nodeVersion ?? 'Waiting for first response'}
            </p>
          </div>
          <div
            role="list"
            className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
          >
            <Metric
              label="Heap used"
              value={
                payload ? `${payload.runtime.memory.heapUsedMb} MB` : 'Pending'
              }
            />
            <Metric
              label="Heap total"
              value={
                payload ? `${payload.runtime.memory.heapTotalMb} MB` : 'Pending'
              }
            />
            <Metric
              label="RSS"
              value={payload ? `${payload.runtime.memory.rssMb} MB` : 'Pending'}
            />
          </div>
        </section>

        <section
          aria-labelledby="live-status-events"
          className="rounded-lg border bg-background p-4 shadow-sm"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h2
                id="live-status-events"
                className="text-base font-semibold leading-tight"
              >
                Poll log
              </h2>
              <p className="text-sm text-muted-foreground">
                {state.pollCount} checks recorded this session
              </p>
            </div>
            <p className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
              {pollIntervalMs / 1_000}s cadence
            </p>
          </div>

          <div role="list" className="mt-3 divide-y">
            {state.events.length === 0 ? (
              <p className="py-3 text-sm text-muted-foreground">
                Waiting for the first backend response.
              </p>
            ) : (
              state.events.map((event) => (
                <div
                  key={event.id}
                  role="listitem"
                  className="flex min-w-0 flex-col gap-1 py-2 sm:flex-row sm:items-center sm:justify-between"
                >
                  <p className="min-w-0 truncate text-sm font-medium">
                    {event.label}
                  </p>
                  <p className="min-w-0 truncate font-mono text-xs tabular-nums text-muted-foreground">
                    {event.detail}
                  </p>
                </div>
              ))
            )}
          </div>
        </section>

        {database?.status === 'error' ? (
          <p className="text-sm text-destructive">{database.error}</p>
        ) : null}
      </div>
    </div>
  );
}
