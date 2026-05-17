import { describe, expect, test } from 'bun:test';
import {
  parseUrlFilters,
  filtersToSearchParams,
} from './released-grades.url-filters';

describe('parseUrlFilters', () => {
  test('returns empty filters when URL has no params', () => {
    expect(parseUrlFilters(new URL('https://x.test/path'))).toEqual({});
  });

  test('parses date range', () => {
    const url = new URL('https://x.test/path?from=2026-04-01&to=2026-04-30');
    expect(parseUrlFilters(url)).toEqual({
      releasedFrom: new Date('2026-04-01'),
      releasedTo: new Date('2026-04-30'),
    });
  });

  test('parses comma-separated student ids', () => {
    const url = new URL('https://x.test/path?students=sp_1,sp_2');
    expect(parseUrlFilters(url)).toEqual({
      studentProfileIds: ['sp_1', 'sp_2'],
    });
  });

  test('parses grade range', () => {
    const url = new URL('https://x.test/path?minGrade=70&maxGrade=85');
    expect(parseUrlFilters(url)).toEqual({ minGrade: 70, maxGrade: 85 });
  });

  test('ignores invalid date strings silently', () => {
    const url = new URL('https://x.test/path?from=not-a-date');
    expect(parseUrlFilters(url)).toEqual({});
  });
});

describe('filtersToSearchParams', () => {
  test('produces the inverse of parseUrlFilters', () => {
    const filters = {
      releasedFrom: new Date('2026-04-01'),
      releasedTo: new Date('2026-04-30'),
      studentProfileIds: ['sp_1', 'sp_2'],
      minGrade: 70,
      maxGrade: 85,
    };
    const params = filtersToSearchParams(filters);
    const url = new URL(`https://x.test/path?${params.toString()}`);
    expect(parseUrlFilters(url)).toEqual(filters);
  });
});
