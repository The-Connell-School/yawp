import { describe, expect, test } from 'bun:test';
import { shouldRevalidate } from './route';

function revalidateArgs(current: string, next: string) {
  return {
    currentUrl: new URL(current),
    nextUrl: new URL(next),
  } as Parameters<typeof shouldRevalidate>[0];
}

describe('app_.documents_.$id shouldRevalidate', () => {
  test('revalidates when the teacher moves to another document id', () => {
    expect(
      shouldRevalidate(
        revalidateArgs(
          'https://yawp.test/app/documents/doc-a?left=tutor&exitTo=%2Fapp%2Fdocuments',
          'https://yawp.test/app/documents/doc-b?left=tutor&exitTo=%2Fapp%2Fdocuments'
        )
      )
    ).toBe(true);
  });

  test('revalidates when the tutor module index changes', () => {
    expect(
      shouldRevalidate(
        revalidateArgs(
          'https://yawp.test/app/documents/doc-a?cmsIdx=0',
          'https://yawp.test/app/documents/doc-a?cmsIdx=1'
        )
      )
    ).toBe(true);
  });

  test('does not revalidate for search-only changes on the same document', () => {
    expect(
      shouldRevalidate(
        revalidateArgs(
          'https://yawp.test/app/documents/doc-a?left=tutor',
          'https://yawp.test/app/documents/doc-a?left=comments'
        )
      )
    ).toBe(false);
  });
});
