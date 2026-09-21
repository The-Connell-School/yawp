import { useFetcher } from 'react-router';
import { useEffect, useRef } from 'react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '~/components/ui/sheet';
import { Button } from '~/components/ui/button';
import { Badge } from '~/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '~/components/ui/table';
import type { TeacherUnsubmitRow } from '~/utils/teacher-document-work-utils';

type UnsubmitSubmissionsSheetProps = {
  submissions: TeacherUnsubmitRow[];
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
};

export function UnsubmitSubmissionsSheet({
  submissions,
  isOpen,
  onClose,
  onSuccess,
}: UnsubmitSubmissionsSheetProps) {
  const fetcher = useFetcher();
  const hasProcessedSuccess = useRef(false);

  const handleUnsubmit = () => {
    const formData = new FormData();
    submissions.forEach((submission) => {
      formData.append('submissionIds', submission.id);
    });

    fetcher.submit(formData, {
      method: 'POST',
      action: '/api/domain/teacher-unsubmit-submission',
    });
  };

  useEffect(() => {
    if (
      fetcher.data?.success &&
      fetcher.state === 'idle' &&
      !hasProcessedSuccess.current
    ) {
      hasProcessedSuccess.current = true;
      onClose();
      onSuccess?.();
    }
  }, [fetcher.data, fetcher.state, onClose, onSuccess]);

  useEffect(() => {
    if (!isOpen) {
      hasProcessedSuccess.current = false;
    }
  }, [isOpen]);

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-3xl">
        <SheetHeader>
          <SheetTitle>Unsubmit Documents</SheetTitle>
          <SheetDescription>
            Withdraw the selected submissions so students can continue editing
            and resubmit them.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-4">
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student</TableHead>
                  <TableHead>Document</TableHead>
                  <TableHead>Submitted</TableHead>
                  <TableHead>Score</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {submissions.map((submission) => (
                  <TableRow key={submission.id}>
                    <TableCell className="font-medium">
                      {submission.document.membership.user.name ||
                        submission.document.membership.user.email}
                    </TableCell>
                    <TableCell>{submission.document.title}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {submission.submittedAt
                        ? new Date(submission.submittedAt).toLocaleString()
                        : '-'}
                    </TableCell>
                    <TableCell>
                      {submission.score ? (
                        <Badge variant="secondary">{submission.score}</Badge>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {fetcher.data?.message ? (
            <div
              className={`rounded-lg border p-3 text-sm ${
                fetcher.data.success
                  ? 'border-green-200 bg-green-50 text-green-900'
                  : 'border-red-200 bg-red-50 text-red-900'
              }`}
            >
              {fetcher.data.message}
            </div>
          ) : null}

          <div className="flex justify-end gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={fetcher.state !== 'idle'}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleUnsubmit}
              disabled={fetcher.state !== 'idle' || submissions.length === 0}
              data-testid="unsubmit-submissions-confirm"
            >
              {fetcher.state !== 'idle'
                ? 'Unsubmitting...'
                : `Unsubmit ${submissions.length} ${
                    submissions.length === 1 ? 'Document' : 'Documents'
                  }`}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
