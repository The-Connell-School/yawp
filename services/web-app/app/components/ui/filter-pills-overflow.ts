/** Sub-pixel tolerance for scroll overflow measurements. */
export const FILTER_PILLS_SCROLL_EPSILON = 1;

export type HorizontalScrollOverflowState = {
  hasOverflow: boolean;
  canScrollLeft: boolean;
  canScrollRight: boolean;
};

export function computeHorizontalScrollOverflow(
  scrollLeft: number,
  scrollWidth: number,
  clientWidth: number,
  epsilon = FILTER_PILLS_SCROLL_EPSILON
): HorizontalScrollOverflowState {
  const hasOverflow = scrollWidth > clientWidth + epsilon;
  return {
    hasOverflow,
    canScrollLeft: hasOverflow && scrollLeft > epsilon,
    canScrollRight:
      hasOverflow && scrollLeft + clientWidth < scrollWidth - epsilon,
  };
}

export function getFilterPillScrollBehavior(
  prefersReducedMotion: boolean
): ScrollBehavior {
  return prefersReducedMotion ? 'auto' : 'smooth';
}

/**
 * Scroll offset that reveals a pill inside the track.
 * The first pill always returns to 0 so a leading inset cannot be scrolled
 * away under a scroll arrow (that left the "All" label clipped on load).
 */
export function filterPillScrollLeftToReveal({
  scrollLeft,
  clientWidth,
  childOffsetLeft,
  childWidth,
  isFirst,
  align = 'nearest',
  epsilon = FILTER_PILLS_SCROLL_EPSILON,
}: {
  scrollLeft: number;
  clientWidth: number;
  childOffsetLeft: number;
  childWidth: number;
  isFirst: boolean;
  /** `start` pins the item to the leading edge so a neighbor is not left half-visible. */
  align?: 'nearest' | 'start';
  epsilon?: number;
}): number {
  if (isFirst) return 0;

  const childRight = childOffsetLeft + childWidth;
  const fullyVisible =
    childOffsetLeft >= scrollLeft - epsilon &&
    childRight <= scrollLeft + clientWidth + epsilon;
  if (fullyVisible) return scrollLeft;
  if (align === 'start' || childOffsetLeft < scrollLeft) {
    return Math.max(0, childOffsetLeft);
  }
  return Math.max(0, childRight - clientWidth);
}

/** Child position in the scroll container's content coordinates. */
export function positionInScrollContainer(
  container: HTMLElement,
  child: HTMLElement
) {
  const containerRect = container.getBoundingClientRect();
  const childRect = child.getBoundingClientRect();
  return {
    left: childRect.left - containerRect.left + container.scrollLeft,
    width: childRect.width,
  };
}

function scrollOffsetToRevealChildFully(
  container: HTMLElement,
  child: HTMLElement,
  align: 'nearest' | 'start' = 'nearest'
): number {
  const { left, width } = positionInScrollContainer(container, child);
  return filterPillScrollLeftToReveal({
    scrollLeft: container.scrollLeft,
    clientWidth: container.clientWidth,
    childOffsetLeft: left,
    childWidth: width,
    isFirst: child === container.firstElementChild,
    align,
  });
}

function scrollTrackTo(container: HTMLElement, left: number, behavior: ScrollBehavior) {
  if (left === container.scrollLeft) return;
  if (behavior === 'auto' || left === 0) {
    container.scrollLeft = left;
    return;
  }
  container.scrollTo({ left, behavior });
}

export function revealFilterPill(
  container: HTMLElement,
  child: HTMLElement,
  behavior: ScrollBehavior,
  align: 'nearest' | 'start' = 'nearest'
) {
  scrollTrackTo(
    container,
    scrollOffsetToRevealChildFully(container, child, align),
    behavior
  );
}

/**
 * Scrolls so the next clipped pill in `direction` is fully visible.
 * Children are expected to be direct pill buttons in the scroll track.
 */
export function scrollToNextHiddenFilterPill(
  container: HTMLElement,
  direction: 'left' | 'right',
  behavior: ScrollBehavior
): void {
  const children = Array.from(container.children).filter(
    (node): node is HTMLElement => node instanceof HTMLElement
  );
  if (children.length === 0) return;

  const { scrollLeft, clientWidth } = container;
  const visibleLeft = scrollLeft;
  const visibleRight = scrollLeft + clientWidth;
  const epsilon = FILTER_PILLS_SCROLL_EPSILON;

  if (direction === 'right') {
    for (const child of children) {
      const { left: childLeft, width } = positionInScrollContainer(container, child);
      const childRight = childLeft + width;
      if (childRight > visibleRight + epsilon) {
        scrollTrackTo(
          container,
          scrollOffsetToRevealChildFully(container, child),
          behavior
        );
        return;
      }
    }
    return;
  }

  for (let index = children.length - 1; index >= 0; index -= 1) {
    const child = children[index]!;
    const { left: childLeft, width } = positionInScrollContainer(container, child);
    const childRight = childLeft + width;
    const partiallyClippedOnLeft =
      childLeft < visibleLeft + epsilon &&
      childRight > visibleLeft + epsilon;
    if (childLeft < visibleLeft - epsilon || partiallyClippedOnLeft) {
      scrollTrackTo(
        container,
        scrollOffsetToRevealChildFully(container, child),
        behavior
      );
      return;
    }
  }
}