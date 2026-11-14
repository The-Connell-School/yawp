import { describe, expect, it } from 'bun:test';
import {
  computeHorizontalScrollOverflow,
  FILTER_PILLS_SCROLL_EPSILON,
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

describe('getFilterPillScrollBehavior', () => {
  it('uses smooth scrolling unless reduced motion is preferred', () => {
    expect(getFilterPillScrollBehavior(false)).toBe('smooth');
    expect(getFilterPillScrollBehavior(true)).toBe('auto');
  });
});