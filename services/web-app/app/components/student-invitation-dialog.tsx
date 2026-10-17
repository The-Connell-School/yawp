import { useRef, useState, type RefObject } from 'react';
import { Copy, Maximize, Minimize } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog';
import { Button } from '~/components/ui/button';
import { cn } from '~/utils/misc';

export function StudentInvitationDialog({
  code,
  open,
  onOpenChange,
  returnFocusRef,
}: {
  code: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  returnFocusRef?: RefObject<HTMLElement | null>;
}) {
  const previousFocus = useRef<HTMLElement | null>(null);
  const [present, setPresent] = useState(false);
  const [feedback, setFeedback] = useState('');
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setPresent(false);
          setFeedback('');
        }
        onOpenChange(next);
      }}
    >
      <DialogContent
        onOpenAutoFocus={() => {
          previousFocus.current =
            document.activeElement instanceof HTMLElement
              ? document.activeElement
              : null;
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          const target = returnFocusRef?.current ?? previousFocus.current;
          requestAnimationFrame(() => {
            if (target?.isConnected) target.focus();
          });
        }}
        className={cn(
          'max-h-[95dvh] overflow-y-auto rounded-xl bg-background p-6 sm:max-w-xl sm:p-8',
          present && 'h-[95dvh] w-[95vw] max-w-[95vw] sm:max-w-[95vw]'
        )}
      >
        <DialogHeader>
          <DialogTitle className="pr-6 text-2xl">
            Add your students to your class
          </DialogTitle>
          <DialogDescription>
            Show these steps to your students to help them join your class.
          </DialogDescription>
        </DialogHeader>
        <ol
          className={cn(
            'my-4 list-decimal space-y-7 pl-7 text-lg leading-relaxed marker:font-bold marker:text-primary',
            present && 'mx-auto my-auto max-w-3xl text-2xl sm:text-3xl'
          )}
        >
          <li>
            Go to <span className="font-semibold">yawp.school</span> and choose{' '}
            <span className="font-semibold">Sign in</span>.
          </li>
          <li>
            Enter your class code:
            <div
              data-testid="invitation-class-code"
              className={cn(
                'my-3 break-all rounded-lg border bg-secondary p-4 font-mono text-3xl font-bold tracking-wide',
                present && 'text-4xl sm:text-6xl'
              )}
            >
              {code}
            </div>
          </li>
          <li>
            Follow the steps to create your account or sign in, then open your
            class.
          </li>
        </ol>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="outline"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(code);
                setFeedback('Class code copied');
              } catch {
                setFeedback('Select the class code above to copy it.');
              }
            }}
          >
            <Copy className="mr-2 size-4" />
            Copy class code
          </Button>
          <Button
            variant="outline"
            aria-pressed={present}
            onClick={() => setPresent((value) => !value)}
          >
            {present ? (
              <Minimize className="mr-2 size-4" />
            ) : (
              <Maximize className="mr-2 size-4" />
            )}
            {present ? 'Exit Present mode' : 'Present'}
          </Button>
          <p role="status" className="text-sm text-muted-foreground">
            {feedback}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
