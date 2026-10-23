import {
  cloneElement,
  isValidElement,
  useEffect,
  useId,
  useRef,
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

const TOUCH_TOOLTIP_MEDIA = '(max-width: 639px)';

function readTouchTooltipViewport() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia(TOUCH_TOOLTIP_MEDIA).matches;
}

function useTouchTooltipViewport() {
  const [isTouchLayout, setIsTouchLayout] = useState(readTouchTooltipViewport);
  useEffect(() => {
    const media = window.matchMedia(TOUCH_TOOLTIP_MEDIA);
    const update = () => setIsTouchLayout(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  return isTouchLayout;
}

/** Disabled, focusable control for assignment-creation actions in locked preview. */
export function PreviewAssignmentCreationControl({
  children,
  tooltip = PREVIEW_ASSIGNMENT_CREATION_DISABLED_TOOLTIP,
}: {
  children: ReactElement;
  tooltip?: string;
}) {
  const isTouchLayout = useTouchTooltipViewport();
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
  }>;

  const lockedChild = cloneElement(child, {
    'aria-disabled': true as const,
    disabled: undefined,
    tabIndex: child.props.tabIndex ?? 0,
    className: cn(child.props.className, 'pointer-events-auto opacity-60'),
    onClick: (event: React.MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (isTouchLayout) {
        setTouchTooltipOpen(true);
      }
    },
    onKeyDown: (event: React.KeyboardEvent) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        if (isTouchLayout) {
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
          open={isTouchLayout ? touchTooltipOpen : undefined}
          onOpenChange={(next) => {
            if (isTouchLayout) setTouchTooltipOpen(next);
          }}
        >
          <TooltipTrigger asChild>
            <span
              className="inline-flex max-w-full"
              data-testid="preview-assignment-creation-disabled"
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
