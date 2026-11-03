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
import { Link } from 'react-router';
import { X } from 'lucide-react';
import { buildAssignmentTryItHref } from '~/components/assignments/assignment-try-it-pill';
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

export function celebrationLeadSentence(preview: FirstAssignmentCelebrationPreview) {
  const rawTitle = preview.title.trim() || 'assignment';
  const title =
    rawTitle.charAt(0).toLowerCase() + rawTitle.slice(1);
  return `The ${title} is live for ${preview.classDisplayName}. Two things to do next:`;
}

function FirstAssignmentCongratulationsCallout({
  preview,
  compact,
  onDismiss,
  headingId,
  headingRef,
}: {
  preview: FirstAssignmentCelebrationPreview;
  compact: boolean;
  onDismiss: () => void;
  headingId: string;
  headingRef: RefObject<HTMLHeadingElement | null>;
}) {
  const inviteStudentsHref = `/app/my-classes/${preview.classId}?tab=students`;
  const tryItHref = buildAssignmentTryItHref({
    id: preview.assignmentId,
    assignmentTypeId: preview.assignmentTypeId,
  });

  const dismissAndNavigate = () => {
    onDismiss();
  };

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
        Your first assignment is ready
      </h2>
      <p className="mt-1.5 text-sm leading-5">
        {celebrationLeadSentence(preview)}
      </p>
      <ol className="mt-3 flex list-none flex-col gap-3 p-0 [counter-reset:step]">
        <li className="relative flex flex-col items-start gap-1 pl-[34px] text-sm leading-5 before:absolute before:left-0 before:top-0 before:flex before:h-6 before:w-6 before:items-center before:justify-center before:rounded-full before:bg-secondary before:text-xs before:font-semibold before:text-secondary-foreground before:content-['1']">
          <b className="font-bold text-foreground">Invite students</b>
          <span className="text-foreground">
            Share the class code or a join link.
          </span>
          <Button size="sm" className="mt-1" asChild>
            <Link to={inviteStudentsHref} onClick={dismissAndNavigate}>
              Invite students
            </Link>
          </Button>
        </li>
        <li className="relative flex flex-col items-start gap-1 pl-[34px] text-sm leading-5 before:absolute before:left-0 before:top-0 before:flex before:h-6 before:w-6 before:items-center before:justify-center before:rounded-full before:bg-secondary before:text-xs before:font-semibold before:text-secondary-foreground before:content-['2']">
          <b className="font-bold text-foreground">Try the assignment</b>
          <span className="text-foreground">
            See it as your students will, Yawp! tutor included.
          </span>
          {tryItHref ? (
            <Button
              size="sm"
              variant="outline"
              className="mt-1"
              asChild
            >
              <Link to={tryItHref} onClick={dismissAndNavigate}>
                Try it as a student
              </Link>
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              className="mt-1"
              type="button"
              disabled
              title="Student preview coming soon"
              data-testid="first-assignment-try-it-stub"
              onClick={dismissAndNavigate}
            >
              Try it as a student
            </Button>
          )}
        </li>
      </ol>
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
          preview={preview}
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
