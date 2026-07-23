import { useFetcher } from 'react-router';
import { useEffect } from 'react';
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
};

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
  const loadFetcher = useFetcher<PasteAlertSheetData>();
  const reviewFetcher = useFetcher<{ success?: boolean }>();
  const isOpen = target !== null;
  const documentId = target?.documentId;

  useEffect(() => {
    if (documentId) {
      loadFetcher.load(`/api/paste-alerts/${documentId}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentId]);

  useEffect(() => {
    if (
      reviewFetcher.data?.success &&
      reviewFetcher.state === 'idle' &&
      documentId
    ) {
      loadFetcher.load(`/api/paste-alerts/${documentId}`);
      onReviewed?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reviewFetcher.data, reviewFetcher.state, documentId]);

  const alerts = loadFetcher.data?.alerts ?? [];
  const isInitialLoad = loadFetcher.state !== 'idle' && !loadFetcher.data;

  const markReviewed = (alertId: string) => {
    if (!documentId) return;
    const formData = new FormData();
    formData.append('alertId', alertId);
    reviewFetcher.submit(formData, {
      method: 'POST',
      action: `/api/paste-alerts/${documentId}`,
    });
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
          {isInitialLoad ? (
            <p className="text-sm text-muted-foreground">
              Loading paste activity…
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
                {alert.content ? (
                  <p className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded bg-white/70 p-2 text-sm text-foreground">
                    {alert.content}
                  </p>
                ) : null}
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
        </div>
      </SheetContent>
    </Sheet>
  );
}
