/**
 * The ambiguous-code selection screen, rendered.
 *
 * The server-side authorization tests in authz.test.ts cannot see this: the screen
 * crashed into the route error boundary for every student who ever hit an ambiguous
 * code, because the "Select a class" row was a Radix `Select.Item` with an empty-string
 * value, which Radix throws on. A student could therefore never complete the second
 * step at all. This test renders the screen and asserts it is the selection UI rather
 * than an error, and that the validated code is carried into the form.
 */
import { GlobalRegistrator } from '@happy-dom/global-registrator';

try {
  GlobalRegistrator.register();
} catch {
  // Multiple Bun test files can share the same process.
}

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { afterEach, describe, expect, mock, test } from 'bun:test';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createRoutesStub } from 'react-router';

mock.module('~/utils/db.server', () => ({ prisma: {} }));
mock.module('~/utils/auth.server', () => ({
  requireUserId: mock(),
  requireMembership: mock(),
}));
mock.module('~/utils/toast.server', () => ({ redirectWithToast: mock() }));
mock.module('~/utils/student-preview.server', () => ({
  getStudentPreviewState: mock(),
}));

const Route = (await import('./route')).default;

const loaderData = {
  membership: { id: 'membership-a' },
  code: 'AMBIG',
  studentPreviewActive: false,
  classes: [
    {
      id: 'class-a1',
      code: 'AMBIG',
      schoolYear: '2024-2025',
      period: '1st',
      grade: '9th',
      school: { name: 'School One' },
      teachers: [{ user: { name: 'Ms One' } }],
    },
    {
      id: 'class-a2',
      code: 'AMBIG',
      schoolYear: '2024-2025',
      period: '2nd',
      grade: '9th',
      school: { name: 'School Two' },
      teachers: [{ user: { name: 'Mr Two' } }],
    },
  ],
};

async function renderAt(path: string) {
  const Stub = createRoutesStub([
    { path: '/enter-code', Component: Route, loader: () => loaderData },
  ]);
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<Stub initialEntries={[path]} />);
  });
  return root;
}

describe('enter-code selection screen', () => {
  let root: Root | null = null;

  afterEach(() => {
    if (root) act(() => root!.unmount());
    root = null;
    document.body.innerHTML = '';
  });

  test('renders the class picker instead of crashing', async () => {
    root = await renderAt('/enter-code?code=AMBIG');

    // Radix keeps the option list in a closed popover, so assert on the screen itself:
    // the picker rendered rather than the route error boundary.
    expect(document.body.textContent).toContain('Select Your Class');
    expect(document.body.textContent).not.toContain('Unexpected Application Error');
    expect(document.querySelector('button[role="combobox"]')).not.toBeNull();
    expect(
      document.querySelector('button[type="submit"]')?.textContent
    ).toContain('Join Class');
  });

  test('carries the validated code into the assign-class submission', async () => {
    root = await renderAt('/enter-code?code=AMBIG');

    const codeInput = document.querySelector(
      'input[name="code"]'
    ) as HTMLInputElement | null;
    expect(codeInput?.value).toBe('AMBIG');

    const intent = document.querySelector(
      'input[name="intent"]'
    ) as HTMLInputElement | null;
    expect(intent?.value).toBe('assign-class');
  });
});
