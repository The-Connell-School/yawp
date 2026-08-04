import { Check, Copy, Loader2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useFetcher } from 'react-router';
import { toast } from 'sonner';
import { Button } from '~/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '~/components/ui/sheet';
import { Badge } from '~/components/ui/badge';
import { cn } from '~/utils/misc';

type HistoryEntry = {
  id: string;
  createdAt: string;
  label: string;
  html: string;
  text: string;
  source: 'revision' | 'journal';
};

type Props = {
  documentId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const ITEMS_PER_PAGE = 10;

function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatFullDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

export const DocumentHistory = ({ documentId, open, onOpenChange }: Props) => {
  const [selectedEntry, setSelectedEntry] = useState<HistoryEntry | null>(null);
  const [allEntries, setAllEntries] = useState<HistoryEntry[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fetcher = useFetcher<{
    entries: HistoryEntry[];
    nextCursor: string | null;
  }>({
    key: 'document-history',
  });

  const loadEntries = useCallback(
    (before?: string) => {
      const params = new URLSearchParams({ limit: String(ITEMS_PER_PAGE) });
      if (before) params.set('before', before);
      fetcher.load(`/api/document/${documentId}/revisions?${params}`);
    },
    [documentId, fetcher]
  );

  useEffect(() => {
    if (open) {
      setAllEntries([]);
      setNextCursor(null);
      setSelectedEntry(null);
      loadEntries();
    }
  }, [open]);

  useEffect(() => {
    if (fetcher.data && fetcher.state === 'idle') {
      const entries = fetcher.data.entries ?? [];
      setAllEntries((prev) => {
        const existingIds = new Set(prev.map((e) => e.id));
        const newEntries = entries.filter((e) => !existingIds.has(e.id));
        return [...prev, ...newEntries];
      });
      setNextCursor(fetcher.data.nextCursor);
      setSelectedEntry((sel) => sel ?? entries[0] ?? null);
    }
  }, [fetcher.data, fetcher.state]);

  const handleCopy = useCallback(async () => {
    if (!selectedEntry) return;
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([selectedEntry.html], { type: 'text/html' }),
          'text/plain': new Blob([selectedEntry.text], { type: 'text/plain' }),
        }),
      ]);
      setCopied(true);
      toast.success('Copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      await navigator.clipboard.writeText(selectedEntry.text);
      setCopied(true);
      toast.success('Copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    }
  }, [selectedEntry]);

  const isLoading = fetcher.state === 'loading';

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col overflow-hidden p-0 sm:max-w-full md:max-w-[800px]">
        <SheetHeader className="border-b px-6 py-4 space-y-1">
          <SheetTitle className="text-base">Version History</SheetTitle>
          <SheetDescription className="text-left text-xs">
            Document versions are kept for 30 days.
          </SheetDescription>
        </SheetHeader>

        <div className="flex grow flex-col overflow-hidden sm:flex-row gap-3 p-4">
          {/* Left: entry list */}
          <div
            ref={scrollRef}
            className="no-scrollbar flex min-h-[180px] max-h-[280px] sm:max-h-full sm:w-[260px] sm:min-w-[260px] flex-col gap-0.5 overflow-y-auto px-1 py-1"
          >
            {isLoading && allEntries.length === 0 ? (
              <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Loading...
              </div>
            ) : allEntries.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                No history yet
              </div>
            ) : (
              <>
                {allEntries.map((entry) => {
                  const isSelected = entry.id === selectedEntry?.id;
                  return (
                    <button
                      key={entry.id}
                      onClick={() => setSelectedEntry(entry)}
                      className={cn(
                        'flex items-center justify-between gap-2 rounded-lg px-3 py-3 text-left transition',
                        isSelected
                          ? 'bg-muted ring-1 ring-border'
                          : 'hover:bg-muted/50'
                      )}
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">
                          {entry.label}
                        </p>
                        <p
                          className="text-xs text-muted-foreground"
                          title={formatFullDate(entry.createdAt)}
                        >
                          {formatRelativeDate(entry.createdAt)}
                        </p>
                      </div>
                      {entry.label === 'Submitted' && (
                        <Badge
                          variant="info-outlined"
                          className="shrink-0 text-[10px]"
                        >
                          Submitted
                        </Badge>
                      )}
                    </button>
                  );
                })}
                {nextCursor && !isLoading && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-1 w-full shrink-0"
                    onClick={() => loadEntries(nextCursor)}
                  >
                    Load more
                  </Button>
                )}
                {isLoading && allEntries.length > 0 && (
                  <div className="flex items-center justify-center py-3 text-xs text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    Loading more...
                  </div>
                )}
              </>
            )}
          </div>

          {/* Right: preview */}
          <div className="flex grow flex-col overflow-hidden rounded-lg border bg-white">
            {selectedEntry ? (
              <>
                <div className="flex items-center justify-between border-b px-4 py-2.5">
                  <div>
                    <p className="text-sm font-medium">{selectedEntry.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatFullDate(selectedEntry.createdAt)}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    onClick={handleCopy}
                  >
                    {copied ? (
                      <>
                        <Check className="h-3.5 w-3.5" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" />
                        Copy
                      </>
                    )}
                  </Button>
                </div>
                <div className="no-scrollbar grow overflow-y-auto p-5">
                  <div
                    dangerouslySetInnerHTML={{ __html: selectedEntry.html }}
                    className="mx-auto max-w-[680px] font-times"
                  />
                </div>
              </>
            ) : (
              <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
                Select a version to preview
              </div>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};
