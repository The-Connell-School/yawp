import { describe, expect, test } from 'bun:test';
import { paginatePrompts, paginationItems } from './pagination';

describe('prompt pagination', () => {
  const prompts = Array.from({ length: 100 }, (_, i) => i + 1);
  test('uses twelve per page and returns the displayed range', () => {
    expect(paginatePrompts(prompts, '2')).toEqual({ page: 2, pageCount: 9, items: prompts.slice(12, 24), start: 13, end: 24 });
    expect(paginatePrompts(prompts, '9').items).toEqual([97, 98, 99, 100]);
  });
  test('clamps invalid and out-of-range pages, including empty results', () => {
    for (const input of [null, '', 'no', '0', '-1', '1.5', 'Infinity']) expect(paginatePrompts(prompts, input).page).toBe(1);
    expect(paginatePrompts(prompts, '99').page).toBe(9);
    expect(paginatePrompts([], '9')).toEqual({ page: 1, pageCount: 1, items: [], start: 0, end: 0 });
    expect(paginatePrompts(prompts.slice(0, 12), '2').pageCount).toBe(1);
  });
  test('keeps boundary and nearby pages with ellipses', () => {
    expect(paginationItems(1, 9)).toEqual([1, 2, 3, 'ellipsis', 9]);
    expect(paginationItems(5, 9)).toEqual([1, 'ellipsis', 4, 5, 6, 'ellipsis', 9]);
    expect(paginationItems(9, 9)).toEqual([1, 'ellipsis', 7, 8, 9]);
    expect(paginationItems(2, 4)).toEqual([1, 2, 3, 4]);
    expect(paginationItems(1, 1)).toEqual([1]);
  });
});
