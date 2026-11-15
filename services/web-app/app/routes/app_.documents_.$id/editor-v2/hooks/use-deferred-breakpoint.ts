import { useEffect, useState } from 'react';
import { scheduleAfterHydration } from '../utils/schedule-after-hydration';

export type DeferredBreakpoint =
  | 'base'
  | 'sm'
  | 'md'
  | 'lg'
  | 'xl'
  | '2xl'
  | undefined;

function breakpointForWidth(width: number): DeferredBreakpoint {
  if (width < 640) return 'base';
  if (width < 768) return 'md';
  if (width < 1024) return 'lg';
  if (width < 1280) return 'xl';
  return '2xl';
}

/** Matches `useBreakpoint` but defers the first measurement until after hydration. */
export function useDeferredBreakpoint(): DeferredBreakpoint {
  const [breakpoint, setBreakpoint] = useState<DeferredBreakpoint>(undefined);

  useEffect(() => {
    const apply = () => {
      setBreakpoint(breakpointForWidth(window.innerWidth));
    };
    scheduleAfterHydration(apply);
    window.addEventListener('resize', apply);
    return () => window.removeEventListener('resize', apply);
  }, []);

  return breakpoint;
}