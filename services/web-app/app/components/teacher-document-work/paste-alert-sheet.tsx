import { useFetcher } from 'react-router';
import { useEffect, useRef, useState } from 'react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '~/components/ui/sheet';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { timeAgo } from '~/utils/timeAgo';

type PasteAlertDetail = {
  id: string;
  createdAt: string;
  textLength: number;
  content: string | null;
  contentTruncated?: boolean;
  reviewedAt: string | null;
  reviewedByMembership: {
    user: { name: string | null; email: string };
  } | null;
};

type PasteAlertSheetData = {
  document: {
    id: string;
    title: string | null;
    membership: { user: { name: string | null; email: string } };
  };
  alerts: PasteAlertDetail[];
  pageCursor: string | null;
  nextCursor: string | null;
  hasMore: boolean;
};

type PasteAlertSheetResponse =
  | PasteAlertSheetData
  | {
      error: string;
    };

export function isUnhandledReviewSuccess(
  response: { success?: boolean } | undefined,
  handledResponse: { success?: boolean } | undefined
) {
  return Boolean(response?.success && response !== handledResponse);
}

export function resolvePasteAlertSheetView(
  documentId: string | undefined,
  data: PasteAlertSheetResponse | undefined,
  fetcherState: 'idle' | 'loading' | 'submitting'
) {
  const matchingData =
    data && 'document' in data && data.document.id === documentId ? data : null;
  const hasError =
    Boolean(documentId) &&
    fetcherState === 'idle' &&
    Boolean(data && 'error' in data);

  return {
    alerts: matchingData?.alerts ?? [],
    hasMore: matchingData?.hasMore ?? false,
    isLoading: Boolean(documentId) && !matchingData && !hasError,
    hasError,
  };
}

export function mergePasteAlertSheetPage(
  current: PasteAlertSheetData | undefined,
  incoming: PasteAlertSheetData
) {
  if (
    !incoming.pageCursor ||
    !current ||
    current.document.id !== incoming.document.id
  ) {
    return incoming;
  }

  const alertIds = new Set(current.alerts.map((alert) => alert.id));
  return {
    ...incoming,
    alerts: [
      ...current.alerts,
      ...incoming.alerts.filter((alert) => !alertIds.has(alert.id)),
    ],
  };
}

export function PasteAlertCapturedContent({
  content,
  contentTruncated,
}: Pick<PasteAlertDetail, 'content' | 'contentTruncated'>) {
  if (!content) {
    return (
      <p className="rounded bg-white/70 p-2 text-sm text-muted-foreground">
        Pasted text unavailable
      </p>
    );
  }

  return (
    <>
      <p className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded bg-white/70 p-2 text-sm text-foreground">
        {content}
      </p>
      {contentTruncated ? (
        <p className="text-xs text-muted-foreground">
          Showing the first 50,000 captured characters.
        </p>
      ) : null}
    </>
  );
}

export type PasteAlertSheetTarget = {
  documentId: string;
  documentTitle: string | null;
  studentName: string;
};

type PasteAlertSheetProps = {
  target: PasteAlertSheetTarget | null;
  onClose: () => void;
  onReviewed?: () => void;
};

export function PasteAlertSheet({
  target,
  onClose,
  onReviewed,
}: PasteAlertSheetProps) {
  const loadFetcher = useFetcher<PasteAlertSheetResponse>();
  const reviewFetcher = useFetcher<{ success?: boolean }>();
  const handledReviewResponse = useRef<typeof reviewFetcher.data>(undefined);
  const [loadedData, setLoadedData] = useState<
    PasteAlertSheetData | undefined
  >();
  const isOpen = target !== null;
  const documentId = target?.documentId;

  useEffect(() => {
    setLoadedData(undefined);
    if (documentId) {
      loadFetcher.load(`/api/paste-alerts/${documentId}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentId]);

  useEffect(() => {
    const response = loadFetcher.data;
    if (
      response &&
      'document' in response &&
      response.document.id === documentId
    ) {
      setLoadedData((current) => mergePasteAlertSheetPage(current, response));
    }
  }, [loadFetcher.data, documentId]);

  useEffect(() => {
    if (
      isUnhandledReviewSuccess(
        reviewFetcher.data,
        handledReviewResponse.current
      ) &&
      reviewFetcher.state === 'idle' &&
      documentId
    ) {
      handledReviewResponse.current = reviewFetcher.data;
      setLoadedData(undefined);
      loadFetcher.load(`/api/paste-alerts/${documentId}`);
      onReviewed?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reviewFetcher.data, reviewFetcher.state, documentId]);

  const { alerts, hasMore, isLoading, hasError } = resolvePasteAlertSheetView(
    documentId,
    loadedData ?? loadFetcher.data,
    loadFetcher.state
  );
  const nextCursor =
    loadedData && loadedData.document.id === documentId
      ? loadedData.nextCursor
      : null;
  const isLoadingMore =
    Boolean(loadedData) && loadFetcher.state !== 'idle';

  const markReviewed = (alertId: string) => {
    if (!documentId) return;
    const formData = new FormData();
    formData.append('alertId', alertId);
    reviewFetcher.submit(formData, {
      method: 'POST',
      action: `/api/paste-alerts/${documentId}`,
    });
  };

  const loadOlder = () => {
    if (!documentId || !nextCursor || loadFetcher.state !== 'idle') return;
    loadFetcher.load(
      `/api/paste-alerts/${documentId}?cursor=${encodeURIComponent(nextCursor)}`
    );
  };

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Paste activity</SheetTitle>
          <SheetDescription>
            {target
              ? `${target.studentName} · ${target.documentTitle ?? 'Untitled document'}`
              : 'Detected pastes for this document, newest first.'}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-3" data-testid="paste-alert-sheet-list">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">
              Loading paste activity…
            </p>
          ) : hasError ? (
            <p className="text-sm text-destructive">
              Paste activity could not be loaded. Close this panel and try
              again.
            </p>
          ) : alerts.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No paste activity recorded.
            </p>
          ) : (
            alerts.map((alert) => (
              <div
                key={alert.id}
                data-testid="paste-alert-row"
                className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-amber-900">
                    {timeAgo(new Date(alert.createdAt))} · {alert.textLength}{' '}
                    characters pasted
                  </span>
                  {alert.reviewedAt ? (
                    <Badge
                      variant="secondary"
                      className="bg-gray-200 text-gray-700"
                    >
                      Reviewed
                    </Badge>
                  ) : (
                    <Badge
                      variant="secondary"
                      className="bg-amber-200 text-amber-900"
                    >
                      Needs review
                    </Badge>
                  )}
                </div>
                <PasteAlertCapturedContent
                  content={alert.content}
                  contentTruncated={alert.contentTruncated}
                />
                {!alert.reviewedAt ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={reviewFetcher.state !== 'idle'}
                    onClick={() => markReviewed(alert.id)}
                  >
                    Mark reviewed
                  </Button>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Reviewed by{' '}
                    {alert.reviewedByMembership?.user.name ||
                      alert.reviewedByMembership?.user.email ||
                      'a teacher'}
                  </p>
                )}
              </div>
            ))
          )}
          {hasMore ? (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                Showing the newest {alerts.length} events. Older paste activity
                is available.
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!nextCursor || isLoadingMore}
                onClick={loadOlder}
              >
                {isLoadingMore ? 'Loading…' : 'Load older activity'}
              </Button>
            </div>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
