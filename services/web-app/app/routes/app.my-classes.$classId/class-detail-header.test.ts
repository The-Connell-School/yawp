import { describe, expect, test } from 'bun:test';
import { resolveClassHeaderTab } from './class-detail-header';

describe('resolveClassHeaderTab', () => {
  test('maps page tab to header tab', () => {
    expect(resolveClassHeaderTab('students')).toBe('students');
    expect(resolveClassHeaderTab('documents')).toBe('documents');
    expect(resolveClassHeaderTab('assignments')).toBe('assignments');
  });
});
