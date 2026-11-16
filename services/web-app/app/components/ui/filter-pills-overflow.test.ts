import { describe, expect, it } from 'bun:test';
import {
  computeHorizontalScrollOverflow,
  FILTER_PILLS_SCROLL_EPSILON,
  filterPillScrollLeftToReveal,
  getFilterPillScrollBehavior,
} from './filter-pills-overflow';

describe('computeHorizontalScrollOverflow', () => {
  it('reports no overflow when content fits', () => {
    expect(
      computeHorizontalScrollOverflow(0, 200, 200, FILTER_PILLS_SCROLL_EPSILON)
    ).toEqual({
      hasOverflow: false,
      canScrollLeft: false,
      canScrollRight: false,
    });
  });

  it('reports overflow with both scroll directions available mid-track', () => {
    expect(
      computeHorizontalScrollOverflow(50, 400, 200, FILTER_PILLS_SCROLL_EPSILON)
    ).toEqual({
      hasOverflow: true,
      canScrollLeft: true,
      canScrollRight: true,
    });
  });

  it('hides the left affordance when scrolled to the start', () => {
    expect(
      computeHorizontalScrollOverflow(0, 400, 200, FILTER_PILLS_SCROLL_EPSILON)
    ).toEqual({
      hasOverflow: true,
      canScrollLeft: false,
      canScrollRight: true,
    });
  });

  it('hides the right affordance when scrolled to the end', () => {
    expect(
      computeHorizontalScrollOverflow(200, 400, 200, FILTER_PILLS_SCROLL_EPSILON)
    ).toEqual({
      hasOverflow: true,
      canScrollLeft: true,
      canScrollRight: false,
    });
  });
});

describe('filterPillScrollLeftToReveal', () => {
  it('returns the first pill to the start even when it was scrolled by its own inset', () => {
    expect(
      filterPillScrollLeftToReveal({
        scrollLeft: 32,
        clientWidth: 364,
        childOffsetLeft: 32,
        childWidth: 64,
        isFirst: true,
      })
    ).toBe(0);
  });

  it('keeps a fully visible later pill where it is', () => {
    expect(
      filterPillScrollLeftToReveal({
        scrollLeft: 40,
        clientWidth: 200,
        childOffsetLeft: 50,
        childWidth: 40,
        isFirst: false,
      })
    ).toBe(40);
  });

  it('scrolls a right-clipped pill fully into the track', () => {
    expect(
      filterPillScrollLeftToReveal({
        scrollLeft: 0,
        clientWidth: 200,
        childOffsetLeft: 180,
        childWidth: 80,
        isFirst: false,
      })
    ).toBe(60);
  });

  it('pins a clipped pill to the leading edge when align is start', () => {
    expect(
      filterPillScrollLeftToReveal({
        scrollLeft: 0,
        clientWidth: 200,
        childOffsetLeft: 180,
        childWidth: 80,
        isFirst: false,
        align: 'start',
      })
    ).toBe(180);
  });

  it('scrolls a left-clipped pill back to its own start', () => {
    expect(
      filterPillScrollLeftToReveal({
        scrollLeft: 100,
        clientWidth: 200,
        childOffsetLeft: 40,
        childWidth: 50,
        isFirst: false,
      })
    ).toBe(40);
  });
});

describe('getFilterPillScrollBehavior', () => {
  it('uses smooth scrolling unless reduced motion is preferred', () => {
    expect(getFilterPillScrollBehavior(false)).toBe('smooth');
    expect(getFilterPillScrollBehavior(true)).toBe('auto');
  });
});