import { GlobalRegistrator } from '@happy-dom/global-registrator';

try {
  GlobalRegistrator.register();
} catch {
  // Multiple Bun test files can share the same process.
}

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { afterEach, describe, expect, it } from 'bun:test';
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createMemoryRouter, RouterProvider } from 'react-router';

import {
  HandleStudentPasswordReset,
} from './handle-student-password-reset';

let root: Root | null = null;

function render(element: ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  const router = createMemoryRouter([{ path: '/', element }], {
    initialEntries: ['/'],
  });
  act(() => {
    root!.render(<RouterProvider router={router} />);
  });
  return container;
}

afterEach(() => {
  if (root) act(() => root!.unmount());
  document.body.innerHTML = '';
  root = null;
});

describe('HandleStudentPasswordReset', () => {
  it('icon trigger is icon-only with aria-label and no labeled row button', () => {
    const el = render(
      <HandleStudentPasswordReset
        studentMembershipId="mem-1"
        studentName="Sam"
        trigger="icon"
      />
    );
    expect(el.textContent).not.toContain('Reset login');
    expect(el.querySelector('button[aria-label="Reset login"]')).not.toBeNull();
  });

  it('sheet trigger is a labeled button in the sheet body', () => {
    const el = render(
      <HandleStudentPasswordReset
        studentMembershipId="mem-1"
        studentName="Sam"
        trigger="sheet"
      />
    );
    expect(
      Array.from(el.querySelectorAll('button')).some((button) =>
        button.textContent?.includes('Reset login')
      )
    ).toBe(true);
  });
});
