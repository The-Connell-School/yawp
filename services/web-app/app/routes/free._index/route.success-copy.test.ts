import { describe, expect, test } from 'bun:test';
import { freeTierSubmitSuccessCopy } from './route';

describe('freeTierSubmitSuccessCopy', () => {
  test('valid event token shows join-link email copy after sign-up', () => {
    expect(
      freeTierSubmitSuccessCopy({
        mode: 'token',
        tokenValid: { valid: true },
      })
    ).toEqual({
      headline: 'Check your email for your join link.',
      detail: null,
    });
  });

  test('waitlist and invalid token keep waitlist confirmation copy', () => {
    expect(freeTierSubmitSuccessCopy({ mode: 'waitlist', tokenValid: null })).toEqual({
      headline: "You're on the list.",
      detail: "We'll email you when a spot opens.",
    });
    expect(
      freeTierSubmitSuccessCopy({
        mode: 'token',
        tokenValid: { valid: false },
      })
    ).toEqual({
      headline: "You're on the list.",
      detail: "We'll email you when a spot opens.",
    });
  });
});
