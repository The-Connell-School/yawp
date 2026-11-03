import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Button } from '~/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog';
import {
  acknowledgeFirstAssignmentCelebration,
  shouldOfferFirstAssignmentCelebrationReopen,
  writeFirstAssignmentCelebrationPending,
} from '~/domain/free-tier/first-assignment-celebration.client';

export function FirstAssignmentCongratulationsDialog({
  assignmentId,
  classId,
  open,
  onOpenChange,
}: {
  assignmentId: string;
  classId?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  useEffect(() => {
    if (open && assignmentId) {
      writeFirstAssignmentCelebrationPending(assignmentId);
    }
  }, [assignmentId, open]);

  const assignmentHref = `/app/assignments/${assignmentId}?highlightAssignment=${assignmentId}`;
  const inviteStudentsHref = classId
    ? `/app/my-classes/${classId}?tab=students`
    : '/app/my-classes';

  const dismiss = () => {
    acknowledgeFirstAssignmentCelebration(assignmentId);
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) dismiss();
        else onOpenChange(next);
      }}
    >
      <DialogContent data-testid="first-assignment-congratulations-dialog">
        <DialogHeader>
          <DialogTitle>
            Congratulations — you&apos;ve created your first assignment!
          </DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-3 pt-1 text-sm text-muted-foreground">
              <p>
                <Link
                  to={assignmentHref}
                  className="font-medium text-primary underline-offset-4 hover:underline"
                  onClick={dismiss}
                >
                  View or edit it here
                </Link>
              </p>
              <div>
                <p className="font-medium text-foreground">Next steps</p>
                <ol className="mt-2 list-decimal space-y-1 pl-5">
                  <li>
                    <Link
                      to={inviteStudentsHref}
                      className="text-primary underline-offset-4 hover:underline"
                      onClick={dismiss}
                    >
                      Invite or add students
                    </Link>
                  </li>
                  <li>Try the assignment as a student (use Try it on the assignment)</li>
                </ol>
              </div>
            </div>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" onClick={dismiss}>
            Got it
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function FirstAssignmentCelebrationReopenButton({
  onReopen,
  syncKey = 0,
}: {
  onReopen: () => void;
  syncKey?: number;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(shouldOfferFirstAssignmentCelebrationReopen());
  }, [syncKey]);

  useEffect(() => {
    const onStorage = () =>
      setVisible(shouldOfferFirstAssignmentCelebrationReopen());
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  if (!visible) return null;

  return (
    <button
      type="button"
      className="text-sm font-medium text-primary underline-offset-4 hover:underline"
      data-testid="first-assignment-celebration-reopen"
      onClick={onReopen}
    >
      Next steps
    </button>
  );
}
