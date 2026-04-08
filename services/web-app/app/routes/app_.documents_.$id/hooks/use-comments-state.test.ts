import { describe, it, expect } from 'bun:test';
import { useCommentsState } from './use-comments-state';

describe('useCommentsState (sanity)', () => {
  it('exports a function', () => {
    expect(typeof useCommentsState).toBe('function');
  });
});
