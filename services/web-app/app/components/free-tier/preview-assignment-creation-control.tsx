import {
  cloneElement,
  isValidElement,
  useEffect,
  useId,
  useState,
  type ReactElement,
} from 'react';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import {
  TooltipContent,
  TooltipProvider,
  TooltipRoot,
  TooltipTrigger,
} from '~/components/ui/tooltip';
import { PREVIEW_ASSIGNMENT_CREATION_DISABLED_TOOLTIP } from '~/domain/free-tier/teaching-access-copy';
import { cn } from '~/utils/misc';

const COARSE_POINTER_MEDIA = '(pointer: coarse)';

function readPreferTapTooltip() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia(COARSE_POINTER_MEDIA).matches;
}

function usePreferTapTooltip() {
  const [preferTapTooltip, setPreferTapTooltip] = useState(readPreferTapTooltip);
  useEffect(() => {
    const media = window.matchMedia(COARSE_POINTER_MEDIA);
    const update = () => setPreferTapTooltip(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  return preferTapTooltip;
}

/** Disabled, focusable control for assignment-creation actions in locked preview. */
export function PreviewAssignmentCreationControl({
  children,
  tooltip = PREVIEW_ASSIGNMENT_CREATION_DISABLED_TOOLTIP,
  fullWidth = false,
}: {
  children: ReactElement;
  tooltip?: string;
  /** Use for list/grid prompt cards so the wrapper spans the row width. */
  fullWidth?: boolean;
}) {
  const preferTapTooltip = usePreferTapTooltip();
  const [touchTooltipOpen, setTouchTooltipOpen] = useState(false);
  const descriptionId = useId();

  if (!isValidElement(children)) {
    return children;
  }

  const child = children as ReactElement<{
    className?: string;
    onClick?: (event: React.MouseEvent) => void;
    onKeyDown?: (event: React.KeyboardEvent) => void;
    disabled?: boolean;
    tabIndex?: number;
    'aria-disabled'?: boolean | 'true' | 'false';
    'aria-describedby'?: string;
  }>;

  const lockedChild = cloneElement(child, {
    'aria-disabled': true as const,
    'aria-describedby': descriptionId,
    disabled: undefined,
    tabIndex: child.props.tabIndex ?? 0,
    className: cn(child.props.className, 'pointer-events-auto opacity-60'),
    onClick: (event: React.MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (preferTapTooltip) {
        setTouchTooltipOpen(true);
      }
    },
    onKeyDown: (event: React.KeyboardEvent) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        if (preferTapTooltip) {
          setTouchTooltipOpen(true);
        }
      }
      child.props.onKeyDown?.(event);
    },
  });

  return (
    <>
      <span id={descriptionId} className="sr-only">
        {tooltip}
      </span>
      <TooltipProvider delayDuration={300}>
        <TooltipRoot
          open={preferTapTooltip ? touchTooltipOpen : undefined}
          onOpenChange={(next) => {
            if (preferTapTooltip) setTouchTooltipOpen(next);
          }}
        >
          <TooltipTrigger asChild>
            <span
              className={cn(
                'max-w-full',
                fullWidth ? 'block w-full' : 'inline-flex'
              )}
              data-testid={
                fullWidth
                  ? 'locked-prompt-card'
                  : 'preview-assignment-creation-disabled'
              }
            >
              {lockedChild}
            </span>
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

export function wrapPreviewAssignmentCreationControl(
  locked: boolean,
  node: ReactElement,
  tooltip?: string
) {
  if (!locked) return node;
  return (
    <PreviewAssignmentCreationControl tooltip={tooltip}>
      {node}
    </PreviewAssignmentCreationControl>
  );
}
