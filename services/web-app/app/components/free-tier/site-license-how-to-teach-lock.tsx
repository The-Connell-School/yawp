import {
  cloneElement,
  isValidElement,
  useId,
  useState,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
} from 'react';
import { Lock } from 'lucide-react';
import {
  Popover,
  PopoverContent,
} from '~/components/ui/popover';
import { SITE_LICENSE_HOW_TO_TEACH_LOCK_MESSAGE } from '~/domain/free-tier/site-license-how-to-teach';
import { cn } from '~/utils/misc';

const SPOTLIGHT_BOX =
  'rounded-xl border bg-[#F8F6F2] p-4 dark:border-border dark:bg-card';

export function LockHowToTeachControl({
  children,
}: {
  children: ReactElement;
}) {
  const [open, setOpen] = useState(false);
  if (!isValidElement(children)) return children;
  const child = children as ReactElement<Record<string, unknown>>;
  const lockedChild = cloneElement(child, {
    href: undefined,
    to: undefined,
    role: 'button',
    tabIndex: 0,
    'aria-disabled': true as const,
    className: cn(
      child.props.className as string | undefined,
      'cursor-not-allowed opacity-80'
    ),
    onClick: (event: MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      setOpen(true);
    },
    onKeyDown: (event: React.KeyboardEvent) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        event.stopPropagation();
        setOpen(true);
      }
    },
  });
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <span className="inline-flex">{lockedChild}</span>
      <PopoverContent
        side="top"
        className="w-auto max-w-xs px-3 py-2 text-sm"
        data-testid="how-to-teach-license-popover"
      >
        {SITE_LICENSE_HOW_TO_TEACH_LOCK_MESSAGE}
      </PopoverContent>
    </Popover>
  );
}

/**
 * How to Teach It on a site-license assignment type for free teachers: visible,
 * visually locked, and every click explains the license requirement.
 */
export function SiteLicenseHowToTeachLockedSection({
  heading,
  children,
  className,
}: {
  heading: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const headingId = useId();

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <section
        aria-labelledby={headingId}
        data-testid="how-to-teach-site-license-locked"
        data-tour="type-how-to-teach"
        data-landing-box=""
        className={cn(SPOTLIGHT_BOX, className)}
        onClickCapture={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOpen(true);
        }}
      >
        <div className="flex items-center justify-between gap-4">
          <h2
            id={headingId}
            className="flex items-center gap-2 text-lg font-semibold sm:text-xl"
          >
            {heading}
            <Lock className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          </h2>
          <span className="text-sm text-muted-foreground">Locked</span>
        </div>
        <div className="mt-3 flex flex-col gap-3 opacity-75">{children}</div>
      </section>
      <PopoverContent
        side="top"
        align="center"
        className="w-auto max-w-xs px-3 py-2 text-sm"
        data-testid="how-to-teach-license-popover"
      >
        {SITE_LICENSE_HOW_TO_TEACH_LOCK_MESSAGE}
      </PopoverContent>
    </Popover>
  );
}