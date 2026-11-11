import { describe, expect, mock, test } from 'bun:test';
import { ASSIGNMENT_LINK_COPIED_TOAST } from './assignment-link-copy';

mock.module('sonner', () => ({
  toast: {
    success: mock(),
    error: mock(),
  },
}));

describe('assignment link copy constants', () => {
  test('uses the design copy for the success toast', () => {
    expect(ASSIGNMENT_LINK_COPIED_TOAST).toBe(
      'Link copied. Paste it into Google Classroom.'
    );
  });
});
