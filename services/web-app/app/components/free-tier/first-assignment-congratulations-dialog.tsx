import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import { X } from 'lucide-react';
import { Button } from '~/components/ui/button';
import {
  acknowledgeFirstAssignmentCelebration,
  readFirstAssignmentCelebrationPendingClassId,
  shouldOfferFirstAssignmentCelebrationReopen,
  writeFirstAssignmentCelebrationPending,
} from '~/domain/free-tier/first-assignment-celebration.client';
import { cn } from '~/utils/misc';

export type FirstAssignmentCelebrationPreview = {
  assignmentId: string;
  classId: string;
  title: string;
  assignmentTypeId: string | null;
  dueAt: string | null;
  classDisplayName: string;
};

function formatCelebrationDueLabel(iso: string) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(iso));
}

export const FIRST_ASSIGNMENT_OVERLAY_HEADING = 'Start with a Class Starter';

export const FIRST_ASSIGNMENT_OVERLAY_BODY_P1 =
  "A five-minute Class Starter is the easiest way to begin. When your students join your class, they'll see the assignment, write their response, and get their first feedback from the Yawp! tutor. It's low-stakes and fun, and it gets everyone comfortable on the platform before the bigger writing starts.";

export const FIRST_ASSIGNMENT_OVERLAY_BODY_P2 =
  "When they're done, they'll submit their assignments. You'll be able to read their writing and their conversations with the tutor, comment on their documents, and use the Grading Assistant to grade it. (Don't worry, we'll walk you through that part too!)";

export const FIRST_ASSIGNMENT_OVERLAY_BODY_P3 =
  "We've written the first prompt for you. Use it as is, or make it your own.";

function FirstAssignmentCongratulationsCallout({
  compact,
  onDismiss,
  headingId,
  headingRef,
}: {
  compact: boolean;
  onDismiss: () => void;
  headingId: string;
  headingRef: RefObject<HTMLHeadingElement | null>;
}) {
  return (
    <div
      role="dialog"
      aria-labelledby={headingId}
      data-testid="first-assignment-congratulations-dialog"
      className={cn(
        'relative rounded-lg bg-popover p-5 pb-3.5 text-popover-foreground shadow-[0_18px_40px_-12px_rgba(0,0,0,0.5)] motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200 motion-reduce:animate-none',
        compact
          ? 'before:absolute before:left-10 before:top-[-8px] before:h-4 before:w-4 before:rotate-45 before:bg-popover motion-safe:slide-in-from-bottom-2'
          : 'before:absolute before:left-[-8px] before:top-[var(--caret,22px)] before:h-4 before:w-4 before:rotate-45 before:bg-popover motion-safe:slide-in-from-right-2'
      )}
    >
      <button
        type="button"
        className="absolute right-3 top-3 inline-flex h-7 w-7 items-center justify-center rounded-full text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="Dismiss"
        onClick={onDismiss}
      >
        <X className="h-4 w-4" />
      </button>
      <h2
        id={headingId}
        ref={headingRef as React.Ref<HTMLHeadingElement>}
        tabIndex={-1}
        className="pr-8 text-lg font-bold leading-7 text-foreground outline-none"
      >
        {FIRST_ASSIGNMENT_OVERLAY_HEADING}
      </h2>
      <p className="mt-1.5 text-sm leading-5 text-foreground">
        {FIRST_ASSIGNMENT_OVERLAY_BODY_P1}
      </p>
      <p className="mt-3 text-sm leading-5 text-foreground">
        {FIRST_ASSIGNMENT_OVERLAY_BODY_P2}
      </p>
      <p className="mt-3 text-sm leading-5 text-foreground">
        {FIRST_ASSIGNMENT_OVERLAY_BODY_P3}
      </p>
      <div className="mt-3 flex justify-end">
        <Button variant="ghost" size="sm" type="button" onClick={onDismiss}>
          Got it
        </Button>
      </div>
    </div>
  );
}

export function FirstAssignmentCelebrationAnchor({
  open,
  preview,
  assignmentRowRef,
  onDismiss,
  children,
}: {
  open: boolean;
  preview: FirstAssignmentCelebrationPreview | null;
  assignmentRowRef: RefObject<HTMLAnchorElement | null>;
  onDismiss: () => void;
  children: ReactNode;
}) {
  const headingId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const [compact, setCompact] = useState(false);
  const [calloutTop, setCalloutTop] = useState(20);
  const [caretOffset, setCaretOffset] = useState(22);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 1023px)');
    const sync = () => setCompact(media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);

  useLayoutEffect(() => {
    if (!open || compact || !assignmentRowRef.current || !anchorRef.current) {
      return;
    }
    const row = assignmentRowRef.current;
    const center = row.offsetTop + row.offsetHeight / 2;
    const top = Math.max(0, center - 200);
    setCalloutTop(top);
    setCaretOffset(center - top - 8);
  }, [assignmentRowRef, compact, open, preview?.assignmentId]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onDismiss();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onDismiss, open]);

  useEffect(() => {
    if (open) {
      headingRef.current?.focus();
    } else {
      assignmentRowRef.current?.focus();
    }
  }, [assignmentRowRef, open]);

  if (!open || !preview) {
    return <>{children}</>;
  }

  return (
    <div ref={anchorRef} className="relative">
      {children}
      <div
        className={cn(
          'z-[7]',
          compact
            ? 'relative mt-4 w-full'
            : 'absolute left-[calc(100%+18px)] top-0 w-[340px]'
        )}
        style={
          compact
            ? undefined
            : { top: calloutTop, ['--caret' as string]: `${caretOffset}px` }
        }
      >
        <FirstAssignmentCongratulationsCallout
          compact={compact}
          onDismiss={onDismiss}
          headingId={headingId}
          headingRef={headingRef}
        />
      </div>
    </div>
  );
}

export function FirstAssignmentCelebrationScrim({
  open,
  onDismiss,
}: {
  open: boolean;
  onDismiss: () => void;
}) {
  if (!open) return null;
  return (
    <button
      type="button"
      aria-label="Dismiss celebration"
      className="fixed inset-0 z-[6] bg-black/40"
      data-testid="first-assignment-celebration-scrim"
      onClick={onDismiss}
    />
  );
}

export function useFirstAssignmentCelebrationDismiss({
  assignmentId,
  onOpenChange,
}: {
  assignmentId: string;
  onOpenChange: (open: boolean) => void;
}) {
  return useCallback(() => {
    acknowledgeFirstAssignmentCelebration(assignmentId);
    onOpenChange(false);
  }, [assignmentId, onOpenChange]);
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

export function syncFirstAssignmentCelebrationPending(
  assignmentId: string,
  classId?: string | null,
  open?: boolean
) {
  if (open !== false) {
    writeFirstAssignmentCelebrationPending(
      assignmentId,
      classId ?? readFirstAssignmentCelebrationPendingClassId()
    );
  }
}
