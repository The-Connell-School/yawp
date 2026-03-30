import { type DocumentVersion, type DocumentSnapshot } from '@app/prisma';
import { ChevronDownIcon, ChevronRightIcon, HistoryIcon, Loader2Icon, RefreshCwIcon } from 'lucide-react';
import { Button } from '~/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '~/components/ui/sheet';
import { cn } from '~/utils/misc';
import { useEffect, useMemo, useState } from 'react';
import { useFetcher } from 'react-router';

type Props = { documentId: string };

const VERSIONS_PER_PAGE = 5;
const REVISIONS_PER_PAGE = 50;
const SESSION_GAP_MS = 30 * 60 * 1000;

type VersionLike = (DocumentVersion | DocumentSnapshot) & { createdAt: string };

type Revision = {
  id: string;
  createdAt: string;
  trigger: string;
  html: string;
  text: string;
};

type RevisionSession = {
  id: string;
  revisions: Revision[];
  startTime: Date;
  endTime: Date;
};

function groupIntoSessions(revisions: Revision[]): RevisionSession[] {
  if (revisions.length === 0) return [];
  const sorted = [...revisions].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
  const sessions: RevisionSession[] = [];
  let current: Revision[] = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const prev = new Date(sorted[i - 1].createdAt).getTime();
    const curr = new Date(sorted[i].createdAt).getTime();
    if (curr - prev > SESSION_GAP_MS) {
      sessions.push({
        id: current[0].id,
        revisions: [...current].reverse(),
        startTime: new Date(current[0].createdAt),
        endTime: new Date(current[current.length - 1].createdAt),
      });
      current = [sorted[i]];
    } else {
      current.push(sorted[i]);
    }
  }
  sessions.push({
    id: current[0].id,
    revisions: [...current].reverse(),
    startTime: new Date(current[0].createdAt),
    endTime: new Date(current[current.length - 1].createdAt),
  });
  return sessions.reverse();
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
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

export const DocumentVersions = ({ documentId }: Props) => {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'versions' | 'snapshots' | 'revisions'>('snapshots');
  const [version, setVersion] = useState<VersionLike | null>(null);
  const [allVersions, setAllVersions] = useState<VersionLike[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const fetcher = useFetcher<VersionLike[]>({ key: 'document-versions' });
  const restoreFetcher = useFetcher({ key: 'restore-version' });

  // Revisions state
  const [allRevisions, setAllRevisions] = useState<Revision[]>([]);
  const [revisionPage, setRevisionPage] = useState(1);
  const [hasMoreRevisions, setHasMoreRevisions] = useState(true);
  const [selectedRevision, setSelectedRevision] = useState<Revision | null>(null);
  const [expandedSessions, setExpandedSessions] = useState<Set<string>>(new Set());
  const revisionFetcher = useFetcher<{ revisions: Revision[] }>({ key: 'document-revisions' });

  const loadVersions = (pageNum: number) => {
    fetcher.load(
      `/api/model/document/${documentId}/versions?page=${pageNum}&limit=${VERSIONS_PER_PAGE}&mode=${mode}`
    );
  };

  const loadRevisions = (pageNum: number) => {
    revisionFetcher.load(
      `/api/document/${documentId}/revisions?page=${pageNum}&limit=${REVISIONS_PER_PAGE}`
    );
  };

  useEffect(() => {
    if (open && mode !== 'revisions') {
      setAllVersions([]);
      setPage(1);
      setHasMore(true);
      loadVersions(1);
    }
    if (open && mode === 'revisions') {
      setAllRevisions([]);
      setRevisionPage(1);
      setHasMoreRevisions(true);
      setSelectedRevision(null);
      setExpandedSessions(new Set());
      loadRevisions(1);
    }
  }, [open, mode]);

  useEffect(() => {
    if (revisionFetcher.data && revisionFetcher.state === 'idle') {
      const revisions = revisionFetcher.data.revisions ?? [];
      if (revisionPage === 1) {
        setAllRevisions(revisions);
        setSelectedRevision(revisions[0] ?? null);
      } else {
        setAllRevisions((prev) => [...prev, ...revisions]);
      }
      setHasMoreRevisions(revisions.length === REVISIONS_PER_PAGE);
    }
  }, [revisionFetcher.data, revisionFetcher.state, revisionPage]);

  const sessions = useMemo(() => groupIntoSessions(allRevisions), [allRevisions]);

  useEffect(() => {
    if (sessions.length > 0 && expandedSessions.size === 0) {
      setExpandedSessions(new Set([sessions[0].id]));
    }
  }, [sessions]);

  useEffect(() => {
    if (
      fetcher.data &&
      Array.isArray(fetcher.data) &&
      fetcher.state === 'idle'
    ) {
      const versions = fetcher.data as VersionLike[];
      if (page === 1) {
        setAllVersions(versions);
        setVersion(versions[0] ?? null);
      } else {
        setAllVersions((prev) => [...prev, ...versions]);
      }
      setHasMore(versions.length === VERSIONS_PER_PAGE);
    }
  }, [fetcher.data, fetcher.state, page]);

  const handleLoadMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    loadVersions(nextPage);
  };

  const handleReload = () => {
    setAllVersions([]);
    setPage(1);
    setHasMore(true);
    loadVersions(1);
  };

  useEffect(() => {
    if (restoreFetcher.state === 'idle' && restoreFetcher.data) {
      setOpen(false);
      window.location.reload();
    }
  }, [restoreFetcher.state, restoreFetcher.data]);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <HistoryIcon size={18} strokeWidth={1.5} className="cursor-pointer" />
      </SheetTrigger>
      <SheetContent className="flex w-full flex-col overflow-hidden rounded-l-none transition sm:max-w-full md:max-w-[900px] md:rounded-l-lg">
        <SheetHeader className="p-1">
          <div className="flex items-center gap-3">
            <SheetTitle>Version History</SheetTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={handleReload}
              disabled={fetcher.state === 'loading'}
            >
              <RefreshCwIcon
                size={16}
                className={cn(
                  'mr-2',
                  fetcher.state === 'loading' ? 'animate-spin' : ''
                )}
              />
              Refresh
            </Button>
          </div>
        </SheetHeader>
        <div className="flex grow flex-col overflow-hidden sm:flex-row">
          <div className="no-scrollbar mb-2 flex max-h-[300px] min-h-[200px] flex-col gap-1 overflow-scroll p-1 sm:mb-0 sm:max-h-full sm:w-1/2">
            <div className="flex items-center gap-2 p-1">
              <Button
                variant={mode === 'snapshots' ? 'default' : 'outline'}
                size="sm"
                onClick={() => {
                  setMode('snapshots');
                  setAllVersions([]);
                  setPage(1);
                  setHasMore(true);
                  loadVersions(1);
                }}
              >
                Snapshots
              </Button>
              <Button
                variant={mode === 'versions' ? 'default' : 'outline'}
                size="sm"
                onClick={() => {
                  setMode('versions');
                  setAllVersions([]);
                  setPage(1);
                  setHasMore(true);
                  loadVersions(1);
                }}
              >
                Autosaves
              </Button>
              <Button
                variant={mode === 'revisions' ? 'default' : 'outline'}
                size="sm"
                onClick={() => {
                  setMode('revisions');
                }}
              >
                Revisions
              </Button>
            </div>
            {mode !== 'revisions' ? (
              <>
                {allVersions.map((v) => (
                  <div key={v.id} className="flex">
                    <button
                      onClick={() => setVersion(v)}
                      className={cn(
                        'h-fit grow rounded px-3 py-2 text-sm text-muted-foreground hover:bg-muted/70 sm:text-base',
                        {
                          'bg-muted text-foreground hover:bg-muted':
                            v.id === version?.id,
                        }
                      )}
                    >
                      {new Date(v.createdAt).toLocaleString()}
                    </button>
                  </div>
                ))}
                {hasMore && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleLoadMore}
                    disabled={fetcher.state === 'loading'}
                    className="mt-2 py-3"
                  >
                    {fetcher.state === 'loading' ? (
                      <>
                        <RefreshCwIcon size={16} className="mr-2 animate-spin" />
                        Loading...
                      </>
                    ) : (
                      'Load More'
                    )}
                  </Button>
                )}
              </>
            ) : (
              <>
                {revisionFetcher.state === 'loading' && allRevisions.length === 0 ? (
                  <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
                    <Loader2Icon size={16} className="mr-2 animate-spin" />
                    Loading...
                  </div>
                ) : sessions.length === 0 ? (
                  <div className="py-8 text-center text-sm text-muted-foreground">
                    No revisions yet
                  </div>
                ) : (
                  <>
                    {sessions.map((session, sessionIndex) => {
                      const isExpanded = expandedSessions.has(session.id);
                      const sessionLabel = sessionIndex === 0
                        ? `${formatDate(session.startTime)}, ${formatTime(session.startTime)} – current`
                        : `${formatDate(session.startTime)}, ${formatTime(session.startTime)} – ${formatTime(session.endTime)}`;

                      return (
                        <div key={session.id} className="flex flex-col">
                          <button
                            onClick={() => {
                              setExpandedSessions((prev) => {
                                const next = new Set(prev);
                                if (next.has(session.id)) next.delete(session.id);
                                else next.add(session.id);
                                return next;
                              });
                            }}
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
                              {session.revisions.map((rev) => (
                                <button
                                  key={rev.id}
                                  onClick={() => setSelectedRevision(rev)}
                                  className={cn(
                                    'flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs',
                                    rev.id === selectedRevision?.id
                                      ? 'bg-muted text-foreground'
                                      : 'text-muted-foreground hover:bg-muted/70'
                                  )}
                                >
                                  <TriggerBadge trigger={rev.trigger} />
                                  <span>{formatTime(new Date(rev.createdAt))}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {hasMoreRevisions && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const nextPage = revisionPage + 1;
                          setRevisionPage(nextPage);
                          loadRevisions(nextPage);
                        }}
                        disabled={revisionFetcher.state === 'loading'}
                        className="mt-2"
                      >
                        {revisionFetcher.state === 'loading' ? (
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
              </>
            )}
          </div>
          <div className="no-scrollbar flex w-full grow flex-col gap-2 overflow-scroll rounded-lg bg-muted p-1">
            {mode !== 'revisions' ? (
              version ? (
                <div
                  dangerouslySetInnerHTML={{ __html: version.html }}
                  className="p-3 font-times"
                />
              ) : null
            ) : (
              selectedRevision ? (
                <div
                  dangerouslySetInnerHTML={{ __html: selectedRevision.html }}
                  className="p-3 font-times"
                />
              ) : (
                <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
                  Select a revision to preview
                </div>
              )
            )}
          </div>
        </div>
        <SheetFooter>
          <div className="flex items-center gap-2">
            <restoreFetcher.Form
              method="post"
              action="/api/domain/restore-document-version"
            >
              <input type="hidden" name="versionId" value={version?.id ?? ''} />
              <Button
                type="submit"
                variant="destructive"
                disabled={!version || restoreFetcher.state === 'submitting'}
              >
                {restoreFetcher.state === 'submitting'
                  ? 'Restoring…'
                  : 'Restore and Reload'}
              </Button>
            </restoreFetcher.Form>
            <Button onClick={() => setOpen(false)}>Close</Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};
