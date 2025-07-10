import { type DocumentVersion } from '@app/prisma';
import { HistoryIcon, RefreshCwIcon } from 'lucide-react';
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

export const DocumentVersions = ({ documentId }: Props) => {
  const [open, setOpen] = useState(false);
  const [version, setVersion] = useState<DocumentVersion | null>(null);
  const [allVersions, setAllVersions] = useState<DocumentVersion[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const fetcher = useFetcher<DocumentVersion[]>({ key: 'document-versions' });

  const loadVersions = (pageNum: number) => {
    fetcher.load(
      `/api/model/document/${documentId}/versions?page=${pageNum}&limit=${VERSIONS_PER_PAGE}`
    );
  };

  useEffect(() => {
    if (open) {
      setAllVersions([]);
      setPage(1);
      setHasMore(true);
      loadVersions(1);
    }
  }, [open]);

  useEffect(() => {
    if (
      fetcher.data &&
      Array.isArray(fetcher.data) &&
      fetcher.state === 'idle'
    ) {
      const versions = fetcher.data as DocumentVersion[];
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
          </div>
          <div className="no-scrollbar flex w-full grow flex-col gap-2 overflow-scroll rounded-lg bg-muted p-1">
            {version ? (
              <div
                dangerouslySetInnerHTML={{ __html: version.html }}
                className="p-3 font-times"
              />
            ) : null}
          </div>
        </div>
        <SheetFooter>
          <Button onClick={() => setOpen(false)}>Close</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};
