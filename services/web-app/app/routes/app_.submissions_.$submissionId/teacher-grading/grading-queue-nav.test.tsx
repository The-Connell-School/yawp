import { GlobalRegistrator } from '@happy-dom/global-registrator';

try {
  GlobalRegistrator.register();
} catch {
  // Multiple Bun test files can share the same process.
}

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { afterEach, describe, expect, mock, test } from 'bun:test';
import { act, type ReactElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';

const navigate = mock();

mock.module('react-router', () => ({
  useNavigate: () => navigate,
  Link: ({
    to,
    children,
    ...rest
  }: {
    to: string;
    children: ReactNode;
  } & Record<string, unknown>) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}));

const { GradingQueueNav } = await import('./grading-queue-nav');

const ANA = {
  submissionId: 'sub-ana',
  studentName: 'Ana Reyes',
  documentTitle: 'Hamlet essay',
  status: 'needs-grading' as const,
};
const CARA = {
  submissionId: 'sub-cara',
  studentName: 'Cara Diaz',
  documentTitle: 'Hamlet essay',
  status: 'graded' as const,
};

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function render(element: ReactElement) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(element);
  });
  return container;
}

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  container = null;
  root = null;
  navigate.mockReset();
});

const hrefFor = (submissionId: string) =>
  `/app/submissions/${submissionId}?edit=1`;

describe('GradingQueueNav', () => {
  test('links both arrows to the neighbouring papers', () => {
    const view = render(
      <GradingQueueNav
        previous={ANA}
        next={CARA}
        position={2}
        total={3}
        hrefFor={hrefFor}
      />
    );

    const previous = view.querySelector('[data-testid="grading-queue-previous"]');
    const next = view.querySelector('[data-testid="grading-queue-next"]');

    expect(previous?.getAttribute('href')).toBe(
      '/app/submissions/sub-ana?edit=1'
    );
    expect(next?.getAttribute('href')).toBe('/app/submissions/sub-cara?edit=1');
  });

  test('names the neighbour and its status so the teacher knows what is next', () => {
    const view = render(
      <GradingQueueNav
        previous={ANA}
        next={CARA}
        position={2}
        total={3}
        hrefFor={hrefFor}
      />
    );

    expect(
      view
        .querySelector('[data-testid="grading-queue-next"]')
        ?.getAttribute('aria-label')
    ).toBe('Next paper: Cara Diaz — Needs Releasing');
    expect(
      view
        .querySelector('[data-testid="grading-queue-previous"]')
        ?.getAttribute('aria-label')
    ).toBe('Previous paper: Ana Reyes — Needs Grading');
  });

  test('shows the teacher where they are in the stack', () => {
    const view = render(
      <GradingQueueNav
        previous={ANA}
        next={CARA}
        position={2}
        total={18}
        hrefFor={hrefFor}
      />
    );

    expect(
      view.querySelector('[data-testid="grading-queue-position"]')?.textContent
    ).toBe('2 of 18');
  });

  test('disables an arrow at each end of the queue instead of linking nowhere', () => {
    const view = render(
      <GradingQueueNav
        previous={null}
        next={CARA}
        position={1}
        total={3}
        hrefFor={hrefFor}
      />
    );

    const previous = view.querySelector(
      '[data-testid="grading-queue-previous"]'
    ) as HTMLButtonElement | null;

    expect(previous?.tagName).toBe('BUTTON');
    expect(previous?.disabled).toBe(true);
    expect(previous?.getAttribute('href')).toBeNull();
  });

  test('Alt+Arrow flips papers without leaving the keyboard', () => {
    render(
      <GradingQueueNav
        previous={ANA}
        next={CARA}
        position={2}
        total={3}
        hrefFor={hrefFor}
      />
    );

    act(() => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowRight', altKey: true })
      );
    });
    expect(navigate).toHaveBeenCalledWith('/app/submissions/sub-cara?edit=1');

    act(() => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowLeft', altKey: true })
      );
    });
    expect(navigate).toHaveBeenCalledWith('/app/submissions/sub-ana?edit=1');
  });

  test('leaves plain arrow keys to the caret and the browser', () => {
    render(
      <GradingQueueNav
        previous={ANA}
        next={CARA}
        position={2}
        total={3}
        hrefFor={hrefFor}
      />
    );

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
      window.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'ArrowRight',
          altKey: true,
          metaKey: true,
        })
      );
    });

    expect(navigate).not.toHaveBeenCalled();
  });

  test('does not navigate past the end of the queue', () => {
    render(
      <GradingQueueNav
        previous={ANA}
        next={null}
        position={3}
        total={3}
        hrefFor={hrefFor}
      />
    );

    act(() => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowRight', altKey: true })
      );
    });

    expect(navigate).not.toHaveBeenCalled();
  });
});
