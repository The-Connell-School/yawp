import { describe, expect, test } from 'bun:test';
import { freeTierSubmitSuccessCopy } from './route';

describe('freeTierSubmitSuccessCopy', () => {
  test('bypass event token shows join-link email copy after sign-up', () => {
    expect(
      freeTierSubmitSuccessCopy({
        redeemed: true,
        bypassWaitlist: true,
      })
    ).toEqual({
      headline: 'Check your email for your join link.',
      detail: null,
    });
  });

  test('waitlist and non-bypass event token keep waitlist confirmation copy', () => {
    expect(freeTierSubmitSuccessCopy({})).toEqual({
      headline: "You're on the list.",
      detail: "We'll email you when a spot opens.",
    });
    expect(
      freeTierSubmitSuccessCopy({
        redeemed: true,
        bypassWaitlist: false,
      })
    ).toEqual({
      headline: "You're on the list.",
      detail: "We'll email you when a spot opens.",
    });
  });
});
