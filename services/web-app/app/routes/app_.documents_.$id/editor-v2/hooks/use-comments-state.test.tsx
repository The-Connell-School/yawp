import { GlobalRegistrator } from '@happy-dom/global-registrator';

try {
  GlobalRegistrator.register();
} catch {
  // shared process
}

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { describe, expect, it } from 'bun:test';
import { act, useEffect, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useCommentsState, type DocComment } from './use-comments-state';

function probe(initial: DocComment[]) {
  let latest: ReturnType<typeof useCommentsState> | null = null;
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);

  function Probe() {
    const state = useCommentsState(initial);
    const stateRef = useRef(state);
    stateRef.current = state;
    useEffect(() => {
      latest = stateRef.current;
    });
    return null;
  }

  act(() => {
    root.render(<Probe />);
  });

  return {
    get() {
      return latest!;
    },
    run(fn: () => void) {
      act(fn);
    },
    unmount() {
      act(() => root.unmount());
      container.remove();
    },
  };
}

describe('useCommentsState (v2)', () => {
  it('adds, replies, archives, and removes comments', () => {
    const p = probe([
      { id: 'c-1', content: 'First', responses: [], archivedAt: null },
    ]);

    p.run(() => {
      p.get().addComment({ id: 'c-2', content: 'New', responses: [] });
    });
    expect(p.get().comments.map((c) => c.id)).toEqual(['c-1', 'c-2']);
    expect(p.get().pendingFocusCommentId).toBe('c-2');

    p.run(() => {
      p.get().addResponse('c-1', { id: 'r-1', content: 'Reply body' });
    });
    expect(p.get().comments[0].responses).toHaveLength(1);

    p.run(() => {
      p.get().setCommentArchived('c-1', new Date('2026-01-01'));
    });
    expect(p.get().comments[0].archivedAt).not.toBeNull();

    p.run(() => {
      p.get().removeComment('c-2');
    });
    expect(p.get().comments).toHaveLength(1);
    p.unmount();
  });
});