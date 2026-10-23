import { GlobalRegistrator } from '@happy-dom/global-registrator';

try {
  GlobalRegistrator.register();
} catch {
  // Multiple Bun test files can share the same process.
}

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

const revalidate = mock();
const fetcher: {
  state: 'idle' | 'submitting' | 'loading';
  data: unknown;
  Form: (props: {
    children: React.ReactNode;
    onSubmit?: () => void;
    className?: string;
    method?: string;
  }) => React.ReactElement;
} = {
  state: 'idle',
  data: null,
  Form: ({ children, onSubmit, className, method }) => (
    <form
      className={className}
      method={method}
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit?.();
      }}
    >
      {children}
    </form>
  ),
};

const actualReactRouter = await import('react-router');
mock.module('react-router', () => ({
  ...actualReactRouter,
  useFetcher: () => fetcher,
  useRevalidator: () => ({ revalidate }),
}));

const { InviteTeachersSheet } = await import('./invite-teachers-sheet');

let root: Root | null = null;

function render(element: ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(element);
  });
  return container;
}

beforeEach(() => {
  revalidate.mockReset();
  fetcher.state = 'idle';
  fetcher.data = null;
});

afterEach(() => {
  if (root) act(() => root!.unmount());
  document.body.innerHTML = '';
  root = null;
});

describe('InviteTeachersSheet', () => {
  it('renders role=status for success and role=alert for partial failure', () => {
    fetcher.data = {
      sentCount: 2,
      failedEmails: ['jo@school.org', 'sam@school.org'],
    };
    render(<InviteTeachersSheet open onOpenChange={() => {}} />);

    expect(document.body.querySelector('[role="status"]')?.textContent).toBe(
      'Invitations sent to 2 teachers.'
    );
    expect(document.body.querySelector('[role="alert"]')?.textContent).toBe(
      "We couldn't send to: jo@school.org, sam@school.org. Try again."
    );
  });

  it('moves focus to the alert after a failed delivery result', () => {
    const focusMock = mock(() => {});
    const originalFocus = HTMLElement.prototype.focus;
    HTMLElement.prototype.focus = focusMock;

    try {
      fetcher.data = {
        sentCount: 0,
        failedEmails: ['bad@example.test'],
      };
      render(<InviteTeachersSheet open onOpenChange={() => {}} />);
      expect(focusMock).toHaveBeenCalled();
    } finally {
      HTMLElement.prototype.focus = originalFocus;
    }
  });
});
