import {
  data as dataResponse,
  Form,
  useLoaderData,
  useFetcher,
  type LoaderFunctionArgs,
} from 'react-router';
import type { Prisma } from '@app/prisma';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { Input } from '~/components/ui/input';
import { Button } from '~/components/ui/button';
import { prisma } from '~/utils/db.server';
import { requireAdmin } from '~/utils/auth.server';
import { useState, useEffect, useRef, useCallback } from 'react';
import { ChevronDown, ChevronRight, Search } from 'lucide-react';
import { cn } from '~/utils/misc';

type TimelineEntry = {
  id: string;
  createdAt: string;
  eventType: string;
  writeSource: string | null;
  requestId: string | null;
  traceId: string | null;
  sessionId: string | null;
  editorSessionId: string | null;
  documentId: string | null;
  userId: string | null;
  membershipId: string | null;
  success: boolean | null;
  status: string | null;
  failureReason: string | null;
  clientSeq: number | null;
  baseRevision: number | null;
  resultingRevision: number | null;
  title: string | null;
  textPreview: string | null;
  metadata: unknown;
};

type DetailData = { metadata: unknown };

type AiLogEntry = {
  id: string;
  createdAt: string;
  model: string;
  provider: string;
  feature: string | null;
  kind: string | null;
  documentSource: string | null;
  documentId: string | null;
  submissionId: string | null;
  documentTextLength: number | null;
  documentTextSha256: string | null;
  assignmentTypeId: string | null;
  assignmentTypeRubricSource: string | null;
  assignmentTypeGradingVersion: number | null;
  rubricCategoryKeys: unknown;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  durationMs: number | null;
  systemPrompt: string | null;
  messages: unknown;
  response: string | null;
  error: string | null;
  metadata: unknown;
};

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

function stripReplayUrl(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value;
  const { replayUrl: _, ...rest } = value as Record<string, unknown>;
  return Object.keys(rest).length > 0 ? rest : null;
}

function metadataRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function metadataString(
  metadata: Record<string, unknown>,
  key: string
): string | null {
  const value = metadata[key];
  return typeof value === 'string' ? value : null;
}

function metadataNumber(
  metadata: Record<string, unknown>,
  key: string
): number | null {
  const value = metadata[key];
  return typeof value === 'number' ? value : null;
}

function metadataFilter(
  key: string,
  value: string | null
): Prisma.LlmLogWhereInput | null {
  return value ? { metadata: { path: [key], equals: value } } : null;
}

export async function loader({ request }: LoaderFunctionArgs) {
  await requireAdmin(request);
  const url = new URL(request.url);

  // Detail (metadata) request -- called lazily from expanded items
  const detailId = url.searchParams.get('detailId');

  if (detailId) {
    const entry = await prisma.documentWriteJournal.findUnique({
      where: { id: detailId },
      select: { metadata: true },
    });
    return dataResponse({
      detail: {
        metadata: stripReplayUrl(entry?.metadata),
      } satisfies DetailData,
    });
  }

  // Normal timeline load
  const userOrEmail = normalizeSearch(url.searchParams.get('userOrEmail'));
  const documentId = normalizeSearch(url.searchParams.get('documentId'));
  const submissionId = normalizeSearch(url.searchParams.get('submissionId'));
  const feature = normalizeSearch(url.searchParams.get('feature'));
  const kind = normalizeSearch(url.searchParams.get('kind'));
  const requestId = normalizeSearch(url.searchParams.get('requestId'));
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
  let matchedMembershipIds: string[] = [];

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

    const memberships = matchedUserIds.length
      ? await prisma.orgMembership.findMany({
          where: { userId: { in: matchedUserIds } },
          select: { id: true },
          take: 300,
        })
      : [];
    matchedMembershipIds = memberships.map((membership) => membership.id);
  }

  const userFilter = userOrEmail
    ? {
        OR: [
          { userId: userOrEmail },
          { membershipId: userOrEmail },
          ...(matchedUserIds.length
            ? [{ userId: { in: matchedUserIds } }]
            : []),
          ...(matchedMembershipIds.length
            ? [{ membershipId: { in: matchedMembershipIds } }]
            : []),
        ],
      }
    : undefined;

  const whereDocumentWriteJournal = {
    ...(createdAtFilter ? { createdAt: createdAtFilter } : {}),
    ...(documentId ? { documentId } : {}),
    ...(requestId ? { requestId } : {}),
    ...(userFilter ?? {}),
  };

  const documentWriteJournals = await prisma.documentWriteJournal.findMany({
    where: whereDocumentWriteJournal,
    orderBy: { createdAt: 'desc' },
    take: 400,
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
      membershipId: true,
      status: true,
      failureReason: true,
      clientSeq: true,
      baseRevision: true,
      resultingRevision: true,
      title: true,
      text: true,
      metadata: true,
    },
  });

  const timeline: TimelineEntry[] = documentWriteJournals.map((entry) => ({
    id: entry.id,
    createdAt: entry.createdAt.toISOString(),
    eventType: entry.eventType,
    writeSource: entry.source,
    requestId: entry.requestId,
    traceId: entry.traceId,
    sessionId: entry.sessionId,
    editorSessionId: entry.editorSessionId,
    documentId: entry.documentId,
    userId: entry.userId,
    membershipId: entry.membershipId,
    success:
      entry.status === 'accepted'
        ? true
        : entry.status === 'rejected'
          ? false
          : null,
    status: entry.status,
    failureReason: entry.failureReason,
    clientSeq: entry.clientSeq,
    baseRevision: entry.baseRevision,
    resultingRevision: entry.resultingRevision,
    title: entry.title,
    textPreview: truncateText(entry.text),
    metadata: stripReplayUrl(entry.metadata),
  }));

  const llmMetadataFilters: Prisma.LlmLogWhereInput[] = [
    metadataFilter('documentId', documentId),
    metadataFilter('submissionId', submissionId),
    metadataFilter('feature', feature),
    metadataFilter('kind', kind),
  ].filter((filter): filter is Prisma.LlmLogWhereInput => Boolean(filter));

  const llmLogs = await prisma.llmLog.findMany({
    where: {
      ...(createdAtFilter ? { createdAt: createdAtFilter } : {}),
      ...(llmMetadataFilters.length ? { AND: llmMetadataFilters } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
    select: {
      id: true,
      createdAt: true,
      model: true,
      provider: true,
      inputTokens: true,
      outputTokens: true,
      totalTokens: true,
      durationMs: true,
      systemPrompt: true,
      messages: true,
      response: true,
      error: true,
      metadata: true,
    },
  });

  const aiLogs: AiLogEntry[] = llmLogs.map((entry) => {
    const metadata = metadataRecord(entry.metadata);
    return {
      id: entry.id,
      createdAt: entry.createdAt.toISOString(),
      model: entry.model,
      provider: entry.provider,
      feature: metadataString(metadata, 'feature'),
      kind: metadataString(metadata, 'kind'),
      documentSource: metadataString(metadata, 'documentSource'),
      documentId: metadataString(metadata, 'documentId'),
      submissionId: metadataString(metadata, 'submissionId'),
      documentTextLength: metadataNumber(metadata, 'documentTextLength'),
      documentTextSha256: metadataString(metadata, 'documentTextSha256'),
      assignmentTypeId: metadataString(metadata, 'assignmentTypeId'),
      assignmentTypeRubricSource: metadataString(
        metadata,
        'assignmentTypeRubricSource'
      ),
      assignmentTypeGradingVersion: metadataNumber(
        metadata,
        'assignmentTypeGradingVersion'
      ),
      rubricCategoryKeys: metadata.rubricCategoryKeys ?? null,
      inputTokens: entry.inputTokens,
      outputTokens: entry.outputTokens,
      totalTokens: entry.totalTokens,
      durationMs: entry.durationMs,
      systemPrompt: entry.systemPrompt,
      messages: entry.messages,
      response: entry.response,
      error: entry.error,
      metadata: entry.metadata,
    };
  });

  return dataResponse({
    filters: {
      userOrEmail: userOrEmail ?? '',
      documentId: documentId ?? '',
      submissionId: submissionId ?? '',
      feature: feature ?? '',
      kind: kind ?? '',
      requestId: requestId ?? '',
      startAt: url.searchParams.get('startAt') ?? '',
      endAt: url.searchParams.get('endAt') ?? '',
    },
    timeline,
    aiLogs,
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

function MetadataSection({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  const fetcher = useFetcher<typeof loader>();

  function toggle() {
    if (!open) {
      setOpen(true);
      if (!fetcher.data) {
        fetcher.load(`?detailId=${id}`);
      }
    } else {
      setOpen(false);
    }
  }

  const detail =
    fetcher.data && 'detail' in fetcher.data
      ? (fetcher.data.detail as DetailData)
      : null;

  const isEmpty = detail && detail.metadata == null;

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
        <span className="font-medium uppercase tracking-wide">Metadata</span>
        {fetcher.state === 'loading' ? (
          <span className="ml-1 text-muted-foreground/60">Loading...</span>
        ) : null}
      </button>

      {open && detail ? (
        isEmpty ? (
          <p className="mt-1 text-xs text-muted-foreground/60 pl-4">
            No metadata
          </p>
        ) : (
          <div className="pl-1">
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
    item.documentId ?? item.userId ?? item.membershipId ?? null;

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
          write
        </span>
      </button>

      {expanded ? (
        <div className="px-9 pb-3 pt-1 grid gap-1.5 bg-muted/20">
          <DetailRow label="ID" value={item.id} />
          {item.documentId ? (
            <DetailRow label="Document" value={item.documentId} />
          ) : null}
          {item.requestId ? (
            <DetailRow label="Request" value={item.requestId} />
          ) : null}
          {item.traceId ? (
            <DetailRow label="Trace" value={item.traceId} />
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
          {item.userId ? <DetailRow label="User" value={item.userId} /> : null}
          {item.membershipId ? (
            <DetailRow label="Membership" value={item.membershipId} />
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
            <DetailRow
              label="Resulting revision"
              value={item.resultingRevision}
            />
          ) : null}
          {item.title ? <DetailRow label="Title" value={item.title} /> : null}
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

          <MetadataSection id={item.id} />
        </div>
      ) : null}
    </div>
  );
}

function AiLogItem({ item }: { item: AiLogEntry }) {
  const [expanded, setExpanded] = useState(false);
  const label = [item.feature, item.kind].filter(Boolean).join(' / ');
  const summaryLabel =
    item.documentId ?? item.submissionId ?? item.assignmentTypeId ?? null;

  return (
    <div
      data-testid="audit-ai-log-item"
      className={cn(
        'border-b last:border-b-0 text-sm transition-colors',
        item.error ? 'bg-destructive/5' : ''
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

        <span className="font-medium text-sm shrink-0 min-w-0 truncate max-w-[240px]">
          {label || 'AI call'}
        </span>

        <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
          {item.provider}
        </span>

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
          ai
        </span>
      </button>

      {expanded ? (
        <div className="px-9 pb-3 pt-1 grid gap-1.5 bg-muted/20">
          <DetailRow label="ID" value={item.id} />
          <DetailRow label="Model" value={item.model} />
          {item.documentSource ? (
            <DetailRow label="Document source" value={item.documentSource} />
          ) : null}
          {item.documentId ? (
            <DetailRow label="Document" value={item.documentId} />
          ) : null}
          {item.submissionId ? (
            <DetailRow label="Submission" value={item.submissionId} />
          ) : null}
          {item.documentTextLength !== null ? (
            <DetailRow label="Text length" value={item.documentTextLength} />
          ) : null}
          {item.documentTextSha256 ? (
            <DetailRow label="Text sha256" value={item.documentTextSha256} />
          ) : null}
          {item.assignmentTypeId ? (
            <DetailRow label="Assignment type" value={item.assignmentTypeId} />
          ) : null}
          {item.assignmentTypeRubricSource ? (
            <DetailRow
              label="Rubric source"
              value={item.assignmentTypeRubricSource}
            />
          ) : null}
          {item.assignmentTypeGradingVersion !== null ? (
            <DetailRow
              label="Rubric version"
              value={item.assignmentTypeGradingVersion}
            />
          ) : null}
          {item.totalTokens !== null ? (
            <DetailRow label="Tokens" value={item.totalTokens} />
          ) : null}
          {item.durationMs !== null ? (
            <DetailRow label="Duration" value={`${item.durationMs}ms`} />
          ) : null}
          {item.error ? <DetailRow label="Error" value={item.error} /> : null}
          <JsonBlock label="Rubric categories" data={item.rubricCategoryKeys} />
          <JsonBlock label="System prompt" data={item.systemPrompt} />
          <JsonBlock label="Messages" data={item.messages} />
          <JsonBlock label="Response" data={item.response} />
          <JsonBlock label="Metadata" data={item.metadata} />
        </div>
      ) : null}
    </div>
  );
}

export default function AdminAuditRoute() {
  const data = useLoaderData<typeof loader>();
  if (!('timeline' in data)) {
    return null;
  }
  const { filters, timeline, aiLogs } = data;
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
    filters.submissionId ||
    filters.feature ||
    filters.kind ||
    filters.requestId ||
    filters.startAt ||
    filters.endAt;

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
            name="submissionId"
            defaultValue={filters.submissionId}
            placeholder="Submission ID"
            className="h-8 w-40 text-sm"
          />
          <Input
            name="feature"
            defaultValue={filters.feature}
            placeholder="AI feature"
            className="h-8 w-32 text-sm"
          />
          <Input
            name="kind"
            defaultValue={filters.kind}
            placeholder="AI kind"
            className="h-8 w-44 text-sm"
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
                  <AuditItem key={item.id} item={item} />
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

      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle>AI Context Logs</CardTitle>
            {aiLogs.length > 0 ? (
              <span className="text-xs text-muted-foreground">
                {aiLogs.length}
              </span>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {aiLogs.length === 0 ? (
            <p className="px-4 pb-4 text-sm text-muted-foreground">
              No AI logs found.
            </p>
          ) : (
            <div className="divide-y divide-border">
              {aiLogs.map((item) => (
                <AiLogItem key={item.id} item={item} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
