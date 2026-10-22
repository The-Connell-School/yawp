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
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import {
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
  mobileSheetBody,
}: {
  locked: boolean;
  children: ReactElement;
  tooltip?: string;
  adminName?: string;
  mobileSheetBody?: string;
}) {
  const breakpoint = useBreakpoint();
  const isMobile =
    breakpoint === 'base' || breakpoint === 'sm' || breakpoint === undefined;
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
    tabIndex?: number;
    'aria-disabled'?: boolean | 'true' | 'false';
  }>;

  const lockedChild = cloneElement(child, {
    'aria-disabled': true as const,
    disabled: undefined,
    tabIndex: isMobile ? child.props.tabIndex : 0,
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
          body={mobileSheetBody}
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
          <TooltipTrigger asChild>
            <span className="inline-flex max-w-full">{lockedChild}</span>
          </TooltipTrigger>
          <TooltipPrimitive.Portal>
            <TooltipContent side="top" className="z-[200]">
              {tooltip}
            </TooltipContent>
          </TooltipPrimitive.Portal>
        </TooltipRoot>
      </TooltipProvider>
    </>
  );
}

export function lockedTeachingButtonProps(locked: boolean) {
  if (!locked) return {};
  return { 'aria-disabled': true as const, 'data-teaching-locked': true };
}
