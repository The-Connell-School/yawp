import { ChevronDownIcon, ChevronRightIcon, HistoryIcon, Loader2Icon } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useFetcher } from 'react-router';
import { Button } from '~/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '~/components/ui/sheet';
import { cn } from '~/utils/misc';

type Revision = {
  id: string;
  createdAt: string;
  trigger: string;
  html: string;
  text: string;
};

type Session = {
  id: string;
  revisions: Revision[];
  startTime: Date;
  endTime: Date;
};

type Props = { documentId: string };

const REVISIONS_PER_PAGE = 50;
const SESSION_GAP_MS = 30 * 60 * 1000; // 30 minutes

function groupIntoSessions(revisions: Revision[]): Session[] {
  if (revisions.length === 0) return [];

  // Revisions come in desc order from API; work in chronological order for grouping
  const sorted = [...revisions].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  const sessions: Session[] = [];
  let current: Revision[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const prev = new Date(sorted[i - 1].createdAt).getTime();
    const curr = new Date(sorted[i].createdAt).getTime();

    if (curr - prev > SESSION_GAP_MS) {
      sessions.push(buildSession(current));
      current = [sorted[i]];
    } else {
      current.push(sorted[i]);
    }
  }

  sessions.push(buildSession(current));

  // Return newest sessions first
  return sessions.reverse();
}

function buildSession(revisions: Revision[]): Session {
  return {
    id: revisions[0].id,
    revisions: [...revisions].reverse(), // newest first within session
    startTime: new Date(revisions[0].createdAt),
    endTime: new Date(revisions[revisions.length - 1].createdAt),
  };
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function TriggerBadge({ trigger }: { trigger: string }) {
  const isSubmit = trigger === 'submit';
  return (
    <span
      className={cn(
        'inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium leading-none',
        isSubmit
          ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
          : 'bg-muted text-muted-foreground'
      )}
    >
      {trigger}
    </span>
  );
}

export const DocumentHistory = ({ documentId }: Props) => {
  const [open, setOpen] = useState(false);
  const [selectedRevision, setSelectedRevision] = useState<Revision | null>(null);
  const [expandedSessions, setExpandedSessions] = useState<Set<string>>(new Set());
  const [allRevisions, setAllRevisions] = useState<Revision[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const fetcher = useFetcher<{ revisions: Revision[] }>({ key: 'document-history' });

  const loadRevisions = (pageNum: number) => {
    fetcher.load(
      `/api/document/${documentId}/revisions?page=${pageNum}&limit=${REVISIONS_PER_PAGE}`
    );
  };

  useEffect(() => {
    if (open) {
      setAllRevisions([]);
      setPage(1);
      setHasMore(true);
      setSelectedRevision(null);
      setExpandedSessions(new Set());
      loadRevisions(1);
    }
  }, [open]);

  useEffect(() => {
    if (fetcher.data && fetcher.state === 'idle') {
      const revisions = fetcher.data.revisions ?? [];
      if (page === 1) {
        setAllRevisions(revisions);
        setSelectedRevision(revisions[0] ?? null);
      } else {
        setAllRevisions((prev) => [...prev, ...revisions]);
      }
      setHasMore(revisions.length === REVISIONS_PER_PAGE);
    }
  }, [fetcher.data, fetcher.state, page]);

  const sessions = useMemo(() => groupIntoSessions(allRevisions), [allRevisions]);

  // Auto-expand the most recent session
  useEffect(() => {
    if (sessions.length > 0 && expandedSessions.size === 0) {
      setExpandedSessions(new Set([sessions[0].id]));
    }
  }, [sessions]);

  const toggleSession = (sessionId: string) => {
    setExpandedSessions((prev) => {
      const next = new Set(prev);
      if (next.has(sessionId)) {
        next.delete(sessionId);
      } else {
        next.add(sessionId);
      }
      return next;
    });
  };

  const handleLoadMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    loadRevisions(nextPage);
  };

  const isLoading = fetcher.state === 'loading';
  const isFirstSessionMostRecent = (index: number) => index === 0;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <HistoryIcon size={18} strokeWidth={1.5} className="cursor-pointer" />
      </SheetTrigger>
      <SheetContent className="flex w-full flex-col overflow-hidden rounded-l-none transition sm:max-w-full md:max-w-[900px] md:rounded-l-lg">
        <SheetHeader className="p-1">
          <SheetTitle>Document History</SheetTitle>
        </SheetHeader>
        <div className="flex grow flex-col overflow-hidden sm:flex-row">
          {/* Left panel: session timeline */}
          <div className="no-scrollbar mb-2 flex max-h-[300px] min-h-[200px] flex-col gap-0.5 overflow-y-auto p-1 sm:mb-0 sm:max-h-full sm:w-[320px] sm:min-w-[320px]">
            {isLoading && allRevisions.length === 0 ? (
              <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
                <Loader2Icon size={16} className="mr-2 animate-spin" />
                Loading...
              </div>
            ) : sessions.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                No history yet
              </div>
            ) : (
              <>
                {sessions.map((session, sessionIndex) => {
                  const isExpanded = expandedSessions.has(session.id);
                  const sessionLabel = isFirstSessionMostRecent(sessionIndex)
                    ? `${formatDate(session.startTime)}, ${formatTime(session.startTime)} – current`
                    : `${formatDate(session.startTime)}, ${formatTime(session.startTime)} – ${formatTime(session.endTime)}`;

                  return (
                    <div key={session.id} className="flex flex-col">
                      <button
                        onClick={() => toggleSession(session.id)}
                        className="flex items-center gap-1.5 rounded px-2 py-1.5 text-left text-sm font-medium hover:bg-muted/70"
                      >
                        {isExpanded ? (
                          <ChevronDownIcon size={14} className="shrink-0 text-muted-foreground" />
                        ) : (
                          <ChevronRightIcon size={14} className="shrink-0 text-muted-foreground" />
                        )}
                        <span className="truncate">{sessionLabel}</span>
                        <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                          {session.revisions.length}
                        </span>
                      </button>

                      {isExpanded && (
                        <div className="ml-3 border-l pl-2">
                          {session.revisions.map((rev, revIndex) => {
                            const isLast = revIndex === session.revisions.length - 1;
                            const isSelected = rev.id === selectedRevision?.id;
                            return (
                              <button
                                key={rev.id}
                                onClick={() => setSelectedRevision(rev)}
                                className={cn(
                                  'flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs',
                                  isSelected
                                    ? 'bg-muted text-foreground'
                                    : 'text-muted-foreground hover:bg-muted/70',
                                  isLast ? 'mb-1' : ''
                                )}
                              >
                                <TriggerBadge trigger={rev.trigger} />
                                <span>{formatTime(new Date(rev.createdAt))}</span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}

                {hasMore && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleLoadMore}
                    disabled={isLoading}
                    className="mt-2"
                  >
                    {isLoading ? (
                      <>
                        <Loader2Icon size={14} className="mr-1.5 animate-spin" />
                        Loading...
                      </>
                    ) : (
                      'Load More'
                    )}
                  </Button>
                )}
              </>
            )}
          </div>

          {/* Right panel: preview */}
          <div className="no-scrollbar flex w-full grow flex-col overflow-y-auto rounded-lg bg-muted p-1">
            {selectedRevision ? (
              <div
                dangerouslySetInnerHTML={{ __html: selectedRevision.html }}
                className="p-3 font-times"
              />
            ) : (
              <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
                Select a revision to preview
              </div>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};
