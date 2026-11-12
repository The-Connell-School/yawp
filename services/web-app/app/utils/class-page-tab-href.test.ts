import { describe, expect, test } from 'bun:test';
import { buildMyClassTabHref } from './class-page-tab-href';

describe('buildMyClassTabHref', () => {
  test('includes tab in search for teacher class sections', () => {
    expect(buildMyClassTabHref('class-1', 'documents')).toEqual({
      pathname: '/app/my-classes/class-1',
      search: '?tab=documents',
    });
  });
});
