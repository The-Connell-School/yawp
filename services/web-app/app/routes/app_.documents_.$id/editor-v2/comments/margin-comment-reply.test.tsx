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
import { MarginCommentReply } from './margin-comment-reply';

describe('MarginCommentReply', () => {
  let root: Root | null = null;

  afterEach(() => {
    if (root) {
      act(() => root?.unmount());
      root = null;
    }
    document.body.innerHTML = '';
  });

  it('shows only the expanded field when autoFocus is true', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => {
      root?.render(
        <MarginCommentReply
          commentId="c-1"
          autoFocus
          onReply={() => {}}
        />
      );
    });

    expect(
      document.querySelector('[data-testid="comment-reply-expanded-c-1"]')
    ).not.toBeNull();
    expect(
      document.querySelector('[data-testid="comment-reply-input-c-1"]')
    ).toBeNull();
  });
});