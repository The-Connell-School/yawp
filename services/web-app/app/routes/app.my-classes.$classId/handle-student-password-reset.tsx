import { useEffect, useRef, useState } from 'react';
import { useFetcher } from 'react-router';
import { Button } from '~/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';

type ResetResponse = {
  success?: boolean;
  error?: string;
  message?: string;
};

export function HandleStudentPasswordResetButton({
  studentMembershipId,
  studentName,
}: {
  studentMembershipId: string;
  studentName: string;
}) {
  const fetcher = useFetcher<ResetResponse>();
  const [open, setOpen] = useState(false);
  const [temporaryPassword, setTemporaryPassword] = useState('');
  const [revealedPassword, setRevealedPassword] = useState<string | null>(null);
  const lastSubmittedPasswordRef = useRef('');

  useEffect(() => {
    if (fetcher.state !== 'idle' || !fetcher.data) return;
    if (fetcher.data.success) {
      setRevealedPassword(lastSubmittedPasswordRef.current);
      setTemporaryPassword('');
    }
  }, [fetcher.state, fetcher.data]);

  const closeDialog = () => {
    setOpen(false);
    setTemporaryPassword('');
    setRevealedPassword(null);
  };

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="w-fit shrink-0"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
      >
        Reset login
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) closeDialog();
          else setOpen(true);
        }}
      >
        <DialogContent
          className="sm:max-w-md"
          data-testid="handle-student-password-reset-dialog"
          onClick={(e) => e.stopPropagation()}
        >
          {revealedPassword ? (
            <>
              <DialogHeader>
                <DialogTitle>Temporary password set</DialogTitle>
                <DialogDescription>
                  Share this password with {studentName} once. They must change
                  it at next login.
                </DialogDescription>
              </DialogHeader>
              <div className="rounded-md border bg-muted/40 px-3 py-2 font-mono text-sm">
                {revealedPassword}
              </div>
              <DialogFooter className="gap-2 sm:gap-0">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    void navigator.clipboard.writeText(revealedPassword);
                  }}
                >
                  Copy password
                </Button>
                <Button type="button" onClick={closeDialog}>Done</Button>
              </DialogFooter>
            </>
          ) : (
            <fetcher.Form
              method="post"
              onSubmit={(e) => {
                e.stopPropagation();
                lastSubmittedPasswordRef.current = temporaryPassword;
              }}
            >
              <DialogHeader>
                <DialogTitle>Reset login for {studentName}</DialogTitle>
                <DialogDescription>
                  Set a temporary password. The student&apos;s current session
                  will end immediately.
                </DialogDescription>
              </DialogHeader>
              <input
                type="hidden"
                name="intent"
                value="reset-student-password"
              />
              <input
                type="hidden"
                name="studentMembershipId"
                value={studentMembershipId}
              />
              <div className="grid gap-2 py-4">
                <Label htmlFor={`temp-pass-${studentMembershipId}`}>
                  Temporary password
                </Label>
                <Input
                  id={`temp-pass-${studentMembershipId}`}
                  name="temporaryPassword"
                  type="text"
                  autoComplete="off"
                  minLength={6}
                  required
                  value={temporaryPassword}
                  onChange={(e) => setTemporaryPassword(e.target.value)}
                />
                {fetcher.data?.error ? (
                  <p className="text-sm text-destructive" role="alert">
                    {fetcher.data.error}
                  </p>
                ) : null}
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={closeDialog}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={fetcher.state !== 'idle'}>
                  {fetcher.state !== 'idle' ? 'Saving…' : 'Set temporary password'}
                </Button>
              </DialogFooter>
            </fetcher.Form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
