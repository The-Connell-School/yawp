import { GlobalRegistrator } from '@happy-dom/global-registrator';

try {
  GlobalRegistrator.register();
} catch {
  // Multiple Bun test files can share the same process.
}

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { afterEach, describe, expect, it } from 'bun:test';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MarginCommentResolvedRow } from './margin-comment-resolved-row';

const baseComment = {
  id: 'comment-1',
  content: 'Resolved note',
  createdAt: new Date(),
  archivedAt: new Date(),
  membership: { user: { name: 'Alex Teacher', email: 'teacher@test' } },
  responses: [],
};

describe('MarginCommentResolvedRow', () => {
  let root: Root | null = null;

  afterEach(() => {
    if (root) {
      act(() => root?.unmount());
      root = null;
    }
    document.body.innerHTML = '';
  });

  it('defaults to collapsed row with Show link', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => {
      root?.render(
        <MarginCommentResolvedRow
          {...(baseComment as any)}
          onArchiveChange={() => {}}
        />
      );
    });

    expect(
      document.querySelector('[data-testid="margin-comment-resolved-comment-1"]')
    ).toBeTruthy();
    expect(document.body.textContent).toContain('Show');
  });
});