import { type DocumentVersion, type DocumentSnapshot } from '@app/prisma';
import { HistoryIcon, RefreshCwIcon } from 'lucide-react';
import { Badge } from '~/components/ui/badge';
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
import { useEffect, useState } from 'react';
import { useFetcher } from 'react-router';

type Props = { documentId: string };

const VERSIONS_PER_PAGE = 5;

const EVENT_TYPE_LABELS: Record<string, string> = {
  'document.save': 'Save',
  'document.title_update': 'Title Update',
  'document.restore': 'Restore',
  'document.submit': 'Submit',
};

const STATUS_VARIANTS: Record<string, 'success' | 'destructive' | 'info-outlined'> = {
  accepted: 'success',
  rejected: 'destructive',
  pending: 'info-outlined',
};

type VersionLike = (DocumentVersion | DocumentSnapshot) & {
  createdAt: string;
  eventType?: string;
  status?: string;
  failureReason?: string | null;
  title?: string;
};

export const DocumentVersions = ({ documentId }: Props) => {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'versions' | 'snapshots' | 'journal'>('snapshots');
  const [version, setVersion] = useState<VersionLike | null>(null);
  const [allVersions, setAllVersions] = useState<VersionLike[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const fetcher = useFetcher<VersionLike[]>({ key: 'document-versions' });
  const restoreFetcher = useFetcher({ key: 'restore-version' });

  const loadVersions = (pageNum: number) => {
    fetcher.load(
      `/api/model/document/${documentId}/versions?page=${pageNum}&limit=${VERSIONS_PER_PAGE}&mode=${mode}`
    );
  };

  useEffect(() => {
    if (open) {
      setAllVersions([]);
      setPage(1);
      setHasMore(true);
      loadVersions(1);
    }
  }, [open, mode]);

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
                onClick={() => setMode('snapshots')}
              >
                Snapshots
              </Button>
              <Button
                variant={mode === 'versions' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setMode('versions')}
              >
                Autosaves
              </Button>
              <Button
                variant={mode === 'journal' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setMode('journal')}
              >
                Save Log
              </Button>
            </div>
            {allVersions.map((v) => (
              <div key={v.id} className="flex" {...(mode === 'journal' ? { 'data-testid': 'journal-entry' } : {})}>
                <button
                  onClick={() => setVersion(v)}
                  className={cn(
                    'h-fit grow rounded px-3 py-2 text-left text-sm text-muted-foreground hover:bg-muted/70 sm:text-base',
                    {
                      'bg-muted text-foreground hover:bg-muted':
                        v.id === version?.id,
                    }
                  )}
                >
                  <div>{new Date(v.createdAt).toLocaleString()}</div>
                  {mode === 'journal' && v.eventType && (
                    <div className="mt-1 flex flex-wrap items-center gap-1">
                      <Badge variant="secondary" size="sm">
                        {EVENT_TYPE_LABELS[v.eventType] ?? v.eventType}
                      </Badge>
                      {v.status && (
                        <Badge
                          variant={STATUS_VARIANTS[v.status] ?? 'outline'}
                          size="sm"
                        >
                          {v.status}
                        </Badge>
                      )}
                    </div>
                  )}
                  {mode === 'journal' &&
                    v.eventType === 'document.title_update' &&
                    v.title && (
                      <div className="mt-1 truncate text-xs text-muted-foreground">
                        Title: {v.title}
                      </div>
                    )}
                  {mode === 'journal' && v.failureReason && (
                    <div className="mt-1 text-xs text-destructive">
                      {v.failureReason}
                    </div>
                  )}
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
          </div>
          <div className="no-scrollbar flex w-full grow flex-col gap-2 overflow-scroll rounded-lg bg-muted p-1" {...(mode === 'journal' ? { 'data-testid': 'journal-preview' } : {})}>
            {version ? (
              <div
                dangerouslySetInnerHTML={{ __html: version.html }}
                className="p-3 font-times"
              />
            ) : null}
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
