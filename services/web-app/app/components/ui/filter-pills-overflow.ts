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

function scrollOffsetToRevealChildFully(
  container: HTMLElement,
  child: HTMLElement
): number {
  const { clientWidth, scrollLeft } = container;
  const childLeft = child.offsetLeft;
  const childRight = childLeft + child.offsetWidth;

  if (childLeft >= scrollLeft && childRight <= scrollLeft + clientWidth) {
    return scrollLeft;
  }

  if (childLeft < scrollLeft) {
    return childLeft;
  }

  return Math.max(0, childRight - clientWidth);
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
      const childLeft = child.offsetLeft;
      const childRight = childLeft + child.offsetWidth;
      if (childRight > visibleRight + epsilon) {
        container.scrollTo({
          left: scrollOffsetToRevealChildFully(container, child),
          behavior,
        });
        return;
      }
    }
    return;
  }

  for (let index = children.length - 1; index >= 0; index -= 1) {
    const child = children[index]!;
    const childLeft = child.offsetLeft;
    const childRight = childLeft + child.offsetWidth;
    const partiallyClippedOnLeft =
      childLeft < visibleLeft + epsilon &&
      childRight > visibleLeft + epsilon;
    if (childLeft < visibleLeft - epsilon || partiallyClippedOnLeft) {
      container.scrollTo({
        left: scrollOffsetToRevealChildFully(container, child),
        behavior,
      });
      return;
    }
  }
}