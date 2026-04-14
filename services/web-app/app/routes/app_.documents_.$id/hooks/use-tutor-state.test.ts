import { describe, it, expect } from 'bun:test';
import { useTutorState } from './use-tutor-state';

describe('useTutorState (sanity)', () => {
  it('exports a function', () => {
    expect(typeof useTutorState).toBe('function');
  });
});
