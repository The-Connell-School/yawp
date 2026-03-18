import {
  data as dataResponse,
  Form,
  useLoaderData,
  useFetcher,
  type LoaderFunctionArgs,
} from 'react-router';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { Input } from '~/components/ui/input';
import { Button } from '~/components/ui/button';
import { prisma } from '~/utils/db.server';
import { requireAdmin } from '~/utils/auth.server';
import { useState, useEffect, useRef, useCallback } from 'react';
import { ChevronDown, ChevronRight, ExternalLink, Search } from 'lucide-react';
import { cn } from '~/utils/misc';

type TimelineEntry = {
  id: string;
  createdAt: string;
  source: 'audit_event' | 'document_write_journal';
  eventType: string;
  ingestSource: string | null;
  writeSource: string | null;
  route: string | null;
  path: string | null;
  method: string | null;
  requestId: string | null;
  traceId: string | null;
  sessionId: string | null;
  editorSessionId: string | null;
  documentId: string | null;
  userId: string | null;
  profileId: string | null;
  success: boolean | null;
  statusCode: number | null;
  status: string | null;
  failureReason: string | null;
  clientSeq: number | null;
  baseRevision: number | null;
  resultingRevision: number | null;
  title: string | null;
  textPreview: string | null;
  replayUrl: string | null;
  metadata: unknown;
};

type DetailData = { payload: unknown; metadata: unknown };

function toMaybeDate(value: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function normalizeSearch(value: string | null) {
  const trimmed = value?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : null;
}

function truncateText(value: string | null, maxLength = 220) {
  if (!value) return null;
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength).trimEnd()}...`;
}

function getReplayUrl(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;
  const replayUrl =
    'replayUrl' in value && typeof value.replayUrl === 'string'
      ? value.replayUrl
      : null;
  return replayUrl;
}

function stripReplayUrl(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value;
  const { replayUrl: _, ...rest } = value as Record<string, unknown>;
  return Object.keys(rest).length > 0 ? rest : null;
}

export async function loader({ request }: LoaderFunctionArgs) {
  await requireAdmin(request);
  const url = new URL(request.url);

  // Detail (payload) request — called lazily from expanded items
  const detailId = url.searchParams.get('detailId');
  const detailSource = url.searchParams.get('detailSource');

  if (detailId && detailSource) {
    if (detailSource === 'audit_event') {
      const event = await prisma.auditEvent.findUnique({
        where: { id: detailId },
        select: { payload: true, metadata: true },
      });
      return dataResponse({
        detail: {
          payload: event?.payload ?? null,
          metadata: stripReplayUrl(event?.metadata),
        } satisfies DetailData,
      });
    }
    const entry = await prisma.documentWriteJournal.findUnique({
      where: { id: detailId },
      select: { metadata: true },
    });
    return dataResponse({
      detail: {
        payload: null,
        metadata: stripReplayUrl(entry?.metadata),
      } satisfies DetailData,
    });
  }

  // Normal timeline load
  const userOrEmail = normalizeSearch(url.searchParams.get('userOrEmail'));
  const documentId = normalizeSearch(url.searchParams.get('documentId'));
  const requestId = normalizeSearch(url.searchParams.get('requestId'));
  const includeDbOps = url.searchParams.get('includeDbOps') === '1';
  const startAt = toMaybeDate(url.searchParams.get('startAt'));
  const endAt = toMaybeDate(url.searchParams.get('endAt'));

  const createdAtFilter =
    startAt || endAt
      ? {
          ...(startAt ? { gte: startAt } : {}),
          ...(endAt ? { lte: endAt } : {}),
        }
      : undefined;

  let matchedUserIds: string[] = [];
  let matchedProfileIds: string[] = [];

  if (userOrEmail) {
    const users = await prisma.user.findMany({
      where: {
        OR: [
          { id: userOrEmail },
          { email: { contains: userOrEmail, mode: 'insensitive' } },
          { name: { contains: userOrEmail, mode: 'insensitive' } },
        ],
      },
      select: { id: true },
      take: 100,
    });
    matchedUserIds = users.map((u) => u.id);

    const profiles = matchedUserIds.length
      ? await prisma.profile.findMany({
          where: { userId: { in: matchedUserIds } },
          select: { id: true },
          take: 300,
        })
      : [];
    matchedProfileIds = profiles.map((p) => p.id);
  }

  const userFilterForAudit = userOrEmail
    ? {
        OR: [
          { userId: userOrEmail },
          { profileId: userOrEmail },
          ...(matchedUserIds.length ? [{ userId: { in: matchedUserIds } }] : []),
          ...(matchedProfileIds.length
            ? [{ profileId: { in: matchedProfileIds } }]
            : []),
        ],
      }
    : undefined;

  const whereAuditEvent = {
    ...(createdAtFilter ? { createdAt: createdAtFilter } : {}),
    ...(documentId ? { documentId } : {}),
    ...(requestId ? { requestId } : {}),
    ...(userFilterForAudit ?? {}),
    ...(!includeDbOps ? { NOT: { eventType: 'db.operation.completed' } } : {}),
  };

  const whereDocumentWriteJournal = {
    ...(createdAtFilter ? { createdAt: createdAtFilter } : {}),
    ...(documentId ? { documentId } : {}),
    ...(requestId ? { requestId } : {}),
    ...(userFilterForAudit ?? {}),
  };

  const [auditEvents, documentWriteJournals] = await Promise.all([
    prisma.auditEvent.findMany({
      where: whereAuditEvent,
      orderBy: { createdAt: 'desc' },
      take: 250,
      select: {
        id: true,
        createdAt: true,
        source: true,
        eventType: true,
        route: true,
        path: true,
        method: true,
        requestId: true,
        traceId: true,
        sessionId: true,
        editorSessionId: true,
        documentId: true,
        userId: true,
        profileId: true,
        success: true,
        statusCode: true,
        metadata: true,
      },
    }),
    prisma.documentWriteJournal.findMany({
      where: whereDocumentWriteJournal,
      orderBy: { createdAt: 'desc' },
      take: 250,
      select: {
        id: true,
        createdAt: true,
        eventType: true,
        source: true,
        requestId: true,
        traceId: true,
        sessionId: true,
        editorSessionId: true,
        documentId: true,
        userId: true,
        profileId: true,
        status: true,
        failureReason: true,
        clientSeq: true,
        baseRevision: true,
        resultingRevision: true,
        title: true,
        text: true,
        metadata: true,
      },
    }),
  ]);

  const timeline: TimelineEntry[] = [
    ...auditEvents.map((event) => ({
      id: event.id,
      createdAt: event.createdAt.toISOString(),
      source: 'audit_event' as const,
      eventType: event.eventType,
      ingestSource: event.source,
      writeSource: null,
      route: event.route,
      path: event.path,
      method: event.method,
      requestId: event.requestId,
      traceId: event.traceId,
      sessionId: event.sessionId,
      editorSessionId: event.editorSessionId,
      documentId: event.documentId,
      userId: event.userId,
      profileId: event.profileId,
      success: event.success,
      statusCode: event.statusCode,
      status: null,
      failureReason: null,
      clientSeq: null,
      baseRevision: null,
      resultingRevision: null,
      title: null,
      textPreview: null,
      replayUrl: getReplayUrl(event.metadata),
      metadata: stripReplayUrl(event.metadata),
    })),
    ...documentWriteJournals.map((entry) => ({
      id: entry.id,
      createdAt: entry.createdAt.toISOString(),
      source: 'document_write_journal' as const,
      eventType: entry.eventType,
      ingestSource: null,
      writeSource: entry.source,
      route: null,
      path: null,
      method: null,
      requestId: entry.requestId,
      traceId: entry.traceId,
      sessionId: entry.sessionId,
      editorSessionId: entry.editorSessionId,
      documentId: entry.documentId,
      userId: entry.userId,
      profileId: entry.profileId,
      success:
        entry.status === 'accepted'
          ? true
          : entry.status === 'rejected'
            ? false
            : null,
      statusCode: null,
      status: entry.status,
      failureReason: entry.failureReason,
      clientSeq: entry.clientSeq,
      baseRevision: entry.baseRevision,
      resultingRevision: entry.resultingRevision,
      title: entry.title,
      textPreview: truncateText(entry.text),
      replayUrl: getReplayUrl(entry.metadata),
      metadata: stripReplayUrl(entry.metadata),
    })),
  ]
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )
    .slice(0, 400);

  return dataResponse({
    filters: {
      userOrEmail: userOrEmail ?? '',
      documentId: documentId ?? '',
      requestId: requestId ?? '',
      includeDbOps,
      startAt: url.searchParams.get('startAt') ?? '',
      endAt: url.searchParams.get('endAt') ?? '',
    },
    timeline,
  });
}

const PAGE_SIZE = 25;

type DetailRowProps = { label: string; value: string | number };
function DetailRow({ label, value }: DetailRowProps) {
  return (
    <div className="flex gap-2 text-xs">
      <span className="w-32 shrink-0 text-muted-foreground">{label}</span>
      <span className="font-mono text-foreground/80 break-all">{value}</span>
    </div>
  );
}

function JsonBlock({ label, data }: { label: string; data: unknown }) {
  if (data == null) return null;
  return (
    <div className="mt-2 space-y-0.5">
      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        {label}
      </span>
      <pre className="rounded-md bg-muted/40 px-3 py-2 text-xs leading-5 text-foreground/80 overflow-x-auto whitespace-pre-wrap break-all">
        {JSON.stringify(data, null, 2)}
      </pre>
    </div>
  );
}

function PayloadSection({
  id,
  source,
}: {
  id: string;
  source: 'audit_event' | 'document_write_journal';
}) {
  const [open, setOpen] = useState(false);
  const fetcher = useFetcher<typeof loader>();

  function toggle() {
    if (!open) {
      setOpen(true);
      if (!fetcher.data) {
        fetcher.load(`?detailId=${id}&detailSource=${source}`);
      }
    } else {
      setOpen(false);
    }
  }

  const detail =
    fetcher.data && 'detail' in fetcher.data
      ? (fetcher.data.detail as DetailData)
      : null;

  const isEmpty = detail && detail.payload == null && detail.metadata == null;

  return (
    <div className="mt-2 border-t border-border/50 pt-2">
      <button
        type="button"
        onClick={toggle}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        {open ? (
          <ChevronDown className="h-3 w-3" />
        ) : (
          <ChevronRight className="h-3 w-3" />
        )}
        <span className="font-medium uppercase tracking-wide">Payload</span>
        {fetcher.state === 'loading' ? (
          <span className="ml-1 text-muted-foreground/60">Loading...</span>
        ) : null}
      </button>

      {open && detail ? (
        isEmpty ? (
          <p className="mt-1 text-xs text-muted-foreground/60 pl-4">
            No payload
          </p>
        ) : (
          <div className="pl-1">
            <JsonBlock label="Payload" data={detail.payload} />
            <JsonBlock label="Metadata" data={detail.metadata} />
          </div>
        )
      ) : null}
    </div>
  );
}

function AuditItem({ item }: { item: TimelineEntry }) {
  const [expanded, setExpanded] = useState(false);

  const isFailure = item.success === false || item.status === 'rejected';
  const isSuccess = item.success === true || item.status === 'accepted';

  const statusBadge =
    item.status ?? (isFailure ? 'failure' : isSuccess ? 'success' : null);
  const summaryLabel =
    item.documentId ?? item.path ?? item.userId ?? item.profileId ?? null;

  return (
    <div
      data-testid="audit-timeline-item"
      data-audit-event-type={item.eventType}
      className={cn(
        'border-b last:border-b-0 text-sm transition-colors',
        isFailure ? 'bg-destructive/5' : ''
      )}
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted/40"
      >
        <span className="text-muted-foreground/60 w-4 shrink-0">
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
        </span>

        <span className="font-medium text-sm shrink-0 min-w-0 truncate max-w-[220px]">
          {item.eventType}
        </span>

        {statusBadge ? (
          <span
            className={cn(
              'shrink-0 rounded-full px-1.5 py-0.5 text-xs font-medium',
              isFailure
                ? 'bg-destructive/15 text-destructive'
                : isSuccess
                  ? 'bg-green-500/15 text-green-700 dark:text-green-400'
                  : 'bg-muted text-muted-foreground'
            )}
          >
            {statusBadge}
          </span>
        ) : null}

        {item.method ? (
          <span className="shrink-0 text-xs font-mono text-muted-foreground">
            {item.method}
          </span>
        ) : null}

        {summaryLabel ? (
          <span className="text-xs text-muted-foreground truncate min-w-0 flex-1">
            {summaryLabel}
          </span>
        ) : (
          <span className="flex-1" />
        )}

        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
          {new Date(item.createdAt).toLocaleString()}
        </span>

        <span className="shrink-0 text-xs text-muted-foreground/60 uppercase tracking-wide">
          {item.source === 'audit_event' ? 'audit' : 'write'}
        </span>

        {item.replayUrl ? (
          <a
            href={item.replayUrl}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="shrink-0 text-primary hover:text-primary/80"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        ) : null}
      </button>

      {expanded ? (
        <div className="px-9 pb-3 pt-1 grid gap-1.5 bg-muted/20">
          <DetailRow label="ID" value={item.id} />
          {item.path ? <DetailRow label="Path" value={item.path} /> : null}
          {item.route ? <DetailRow label="Route" value={item.route} /> : null}
          {item.method ? (
            <DetailRow label="Method" value={item.method} />
          ) : null}
          {item.statusCode !== null ? (
            <DetailRow label="Status code" value={item.statusCode} />
          ) : null}
          {item.documentId ? (
            <DetailRow label="Document" value={item.documentId} />
          ) : null}
          {item.requestId ? (
            <DetailRow label="Request" value={item.requestId} />
          ) : null}
          {item.traceId ? (
            <DetailRow label="Trace" value={item.traceId} />
          ) : null}
          {item.ingestSource ? (
            <DetailRow label="Audit source" value={item.ingestSource} />
          ) : null}
          {item.writeSource ? (
            <DetailRow label="Write source" value={item.writeSource} />
          ) : null}
          {item.sessionId ? (
            <DetailRow label="Session" value={item.sessionId} />
          ) : null}
          {item.editorSessionId ? (
            <DetailRow label="Editor session" value={item.editorSessionId} />
          ) : null}
          {item.userId ? (
            <DetailRow label="User" value={item.userId} />
          ) : null}
          {item.profileId ? (
            <DetailRow label="Profile" value={item.profileId} />
          ) : null}
          {item.status ? (
            <DetailRow label="Write status" value={item.status} />
          ) : null}
          {item.clientSeq !== null ? (
            <DetailRow label="Client seq" value={item.clientSeq} />
          ) : null}
          {item.baseRevision !== null ? (
            <DetailRow label="Base revision" value={item.baseRevision} />
          ) : null}
          {item.resultingRevision !== null ? (
            <DetailRow label="Resulting revision" value={item.resultingRevision} />
          ) : null}
          {item.title ? (
            <DetailRow label="Title" value={item.title} />
          ) : null}
          {item.failureReason ? (
            <DetailRow label="Failure reason" value={item.failureReason} />
          ) : null}
          {item.textPreview ? (
            <div className="mt-1 rounded-md bg-muted/40 px-3 py-2 text-xs leading-5 text-foreground/80 font-mono whitespace-pre-wrap">
              {item.textPreview}
            </div>
          ) : null}

          {item.metadata != null ? (
            <JsonBlock label="Metadata" data={item.metadata} />
          ) : null}

          <PayloadSection id={item.id} source={item.source} />
        </div>
      ) : null}
    </div>
  );
}

export default function AdminAuditRoute() {
  const { filters, timeline } = useLoaderData<typeof loader>();
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const visibleItems = timeline.slice(0, visibleCount);
  const hasMore = visibleCount < timeline.length;

  const loadMore = useCallback(() => {
    setVisibleCount((c) => Math.min(c + PAGE_SIZE, timeline.length));
  }, [timeline.length]);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [timeline]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasMore) {
          loadMore();
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loadMore]);

  const hasActiveFilters =
    filters.userOrEmail ||
    filters.documentId ||
    filters.requestId ||
    filters.startAt ||
    filters.endAt ||
    filters.includeDbOps;

  return (
    <div className="p-3 sm:p-5 space-y-4">
      <Form method="get">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            name="userOrEmail"
            defaultValue={filters.userOrEmail}
            placeholder="User / email"
            className="h-8 w-48 text-sm"
          />
          <Input
            name="documentId"
            defaultValue={filters.documentId}
            placeholder="Document ID"
            className="h-8 w-40 text-sm"
          />
          <Input
            name="requestId"
            defaultValue={filters.requestId}
            placeholder="Request ID"
            className="h-8 w-40 text-sm"
          />
          <Input
            name="startAt"
            type="datetime-local"
            defaultValue={filters.startAt}
            className="h-8 text-sm"
          />
          <Input
            name="endAt"
            type="datetime-local"
            defaultValue={filters.endAt}
            className="h-8 text-sm"
          />
          <label className="flex items-center gap-1.5 text-sm text-muted-foreground cursor-pointer select-none">
            <input
              name="includeDbOps"
              type="checkbox"
              value="1"
              defaultChecked={filters.includeDbOps}
              className="rounded"
            />
            DB ops
          </label>
          <Button type="submit" size="sm" className="h-8 gap-1.5">
            <Search className="h-3.5 w-3.5" />
            Search
          </Button>
          {hasActiveFilters ? (
            <a
              href="?"
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Clear
            </a>
          ) : null}
        </div>
      </Form>

      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle>Timeline</CardTitle>
            {timeline.length > 0 ? (
              <span className="text-xs text-muted-foreground">
                {visibleCount} of {timeline.length}
              </span>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {timeline.length === 0 ? (
            <p className="px-4 pb-4 text-sm text-muted-foreground">
              No events found.
            </p>
          ) : (
            <>
              <div className="divide-y divide-border">
                {visibleItems.map((item) => (
                  <AuditItem key={`${item.source}:${item.id}`} item={item} />
                ))}
              </div>

              <div ref={sentinelRef} className="px-4 py-3">
                {hasMore ? (
                  <p className="text-center text-xs text-muted-foreground">
                    Loading more...
                  </p>
                ) : (
                  <p className="text-center text-xs text-muted-foreground">
                    All {timeline.length} events loaded
                  </p>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
