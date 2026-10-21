import {
  cloneElement,
  isValidElement,
  useId,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import useBreakpoint from '~/hooks/useBreakpoint';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipRoot,
  TooltipTrigger,
} from '~/components/ui/tooltip';
import { TEACHING_ACCESS_LOCKED_TOOLTIP } from '~/domain/free-tier/teaching-access-copy';
import { LockedTeachingMobileSheet } from './locked-teaching-mobile-sheet';
import { cn } from '~/utils/misc';

export function LockedTeachingControl({
  locked,
  children,
  tooltip = TEACHING_ACCESS_LOCKED_TOOLTIP,
  adminName = 'your administrator',
}: {
  locked: boolean;
  children: ReactElement;
  tooltip?: string;
  adminName?: string;
}) {
  const breakpoint = useBreakpoint();
  const isMobile = breakpoint === 'base' || breakpoint === 'sm';
  const [sheetOpen, setSheetOpen] = useState(false);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const descriptionId = useId();

  if (!locked || !isValidElement(children)) {
    return children;
  }

  const child = children as ReactElement<{
    className?: string;
    onClick?: (event: React.MouseEvent) => void;
    onKeyDown?: (event: React.KeyboardEvent) => void;
    disabled?: boolean;
    'aria-disabled'?: boolean | 'true' | 'false';
  }>;

  const lockedChild = cloneElement(child, {
    'aria-disabled': true as const,
    disabled: undefined,
    className: cn(child.props.className, 'pointer-events-auto opacity-60'),
    onClick: (event: React.MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      returnFocusRef.current = event.currentTarget as HTMLElement;
      if (isMobile) {
        setSheetOpen(true);
      }
    },
    onKeyDown: (event: React.KeyboardEvent) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        returnFocusRef.current = event.currentTarget as HTMLElement;
        if (isMobile) setSheetOpen(true);
      }
      child.props.onKeyDown?.(event);
    },
  });

  if (isMobile) {
    return (
      <>
        <span id={descriptionId} className="sr-only">
          {tooltip}
        </span>
        {lockedChild}
        <LockedTeachingMobileSheet
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          returnFocusRef={returnFocusRef}
          adminName={adminName}
        />
      </>
    );
  }

  return (
    <>
      <span id={descriptionId} className="sr-only">
        {tooltip}
      </span>
      <TooltipProvider delayDuration={300}>
        <TooltipRoot>
          <TooltipTrigger asChild>{lockedChild}</TooltipTrigger>
          <TooltipContent side="top">{tooltip}</TooltipContent>
        </TooltipRoot>
      </TooltipProvider>
    </>
  );
}

export function lockedTeachingButtonProps(locked: boolean) {
  if (!locked) return {};
  return { 'aria-disabled': true as const, 'data-teaching-locked': true };
}
