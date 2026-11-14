import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import {
  computeHorizontalScrollOverflow,
  getFilterPillScrollBehavior,
  scrollToNextHiddenFilterPill,
  type HorizontalScrollOverflowState,
} from './filter-pills-overflow';

const EMPTY_OVERFLOW: HorizontalScrollOverflowState = {
  hasOverflow: false,
  canScrollLeft: false,
  canScrollRight: false,
};

export function useFilterPillsOverflow(optionCount: number) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState<HorizontalScrollOverflowState>(
    EMPTY_OVERFLOW
  );
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  const measureOverflow = useCallback(() => {
    const track = trackRef.current;
    if (!track) {
      setOverflow(EMPTY_OVERFLOW);
      return;
    }

    const { scrollLeft, scrollWidth, clientWidth } = track;
    setOverflow(
      computeHorizontalScrollOverflow(scrollLeft, scrollWidth, clientWidth)
    );
  }, []);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => setPrefersReducedMotion(media.matches);
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, []);

  useLayoutEffect(() => {
    measureOverflow();
  }, [measureOverflow, optionCount, prefersReducedMotion]);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;

    measureOverflow();

    const resizeObserver = new ResizeObserver(measureOverflow);
    resizeObserver.observe(track);

    const mutationObserver = new MutationObserver(measureOverflow);
    mutationObserver.observe(track, { childList: true, subtree: true });

    return () => {
      resizeObserver.disconnect();
      mutationObserver.disconnect();
    };
  }, [measureOverflow, optionCount]);

  const scrollTabs = useCallback(
    (direction: 'left' | 'right') => {
      const track = trackRef.current;
      if (!track) return;
      scrollToNextHiddenFilterPill(
        track,
        direction,
        getFilterPillScrollBehavior(prefersReducedMotion)
      );
    },
    [prefersReducedMotion]
  );

  const revealTab = useCallback(
    (button: HTMLButtonElement | null) => {
      if (!button) return;
      button.scrollIntoView({
        block: 'nearest',
        inline: 'nearest',
        behavior: getFilterPillScrollBehavior(prefersReducedMotion),
      });
    },
    [prefersReducedMotion]
  );

  return {
    trackRef,
    overflow,
    measureOverflow,
    scrollTabs,
    revealTab,
    prefersReducedMotion,
  };
}