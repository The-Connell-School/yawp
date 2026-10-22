import { describe, expect, test } from 'bun:test';
import { shouldRevalidate } from './route';

function revalidateArgs(current: string, next: string) {
  return {
    currentUrl: new URL(current),
    nextUrl: new URL(next),
    defaultShouldRevalidate: false,
  } as Parameters<typeof shouldRevalidate>[0];
}

describe('app_.submissions_.$submissionId shouldRevalidate', () => {
  test('revalidates when the teacher opens another submission', () => {
    expect(
      shouldRevalidate(
        revalidateArgs(
          'https://yawp.test/app/submissions/sub-a?edit=1',
          'https://yawp.test/app/submissions/sub-b?edit=1'
        )
      )
    ).toBe(true);
  });

  test('defers to the default for same-submission search changes', () => {
    expect(
      shouldRevalidate(
        revalidateArgs(
          'https://yawp.test/app/submissions/sub-a?edit=1',
          'https://yawp.test/app/submissions/sub-a?edit=1&tab=comments'
        )
      )
    ).toBe(false);
  });
});
