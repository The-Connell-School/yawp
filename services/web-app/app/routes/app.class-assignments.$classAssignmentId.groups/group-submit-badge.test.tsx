import { GlobalRegistrator } from '@happy-dom/global-registrator';

try {
  GlobalRegistrator.register();
} catch {
  // Multiple Bun test files can share the same process.
}

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { afterEach, describe, expect, test } from 'bun:test';
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { GroupSubmitBadge } from './group-submit-badge';
import type { BoardGroupSubmitStatus } from '~/domain/collaboration/submit-readiness';

/**
 * What the teacher can see about one group from the board.
 *
 * The board is a drag-and-drop surface that a unit test cannot render, so the
 * badge is its own component: this is the part with something to get wrong.
 */

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

afterEach(() => {
  if (root) act(() => root!.unmount());
  document.body.innerHTML = '';
  root = null;
});

const status = (
  overrides: Partial<BoardGroupSubmitStatus> = {}
): BoardGroupSubmitStatus => ({
  total: 3,
  submittedCount: 2,
  everyoneSubmitted: false,
  outstanding: ['Devon'],
  submittedAt: null,
  submittedByTeacherName: null,
  ...overrides,
});

describe('GroupSubmitBadge', () => {
  test('names who the group is waiting on', () => {
    // The fraction says a group is stuck; the name says who to talk to, which
    // is the thing a teacher can act on before the bell.
    const container = render(<GroupSubmitBadge status={status()} />);

    expect(container.textContent).toContain('2 of 3 submitted');
    expect(container.textContent).toContain('waiting on Devon');
  });

  test('lists several outstanding students readably', () => {
    const container = render(
      <GroupSubmitBadge
        status={status({ submittedCount: 0, outstanding: ['Devon', 'Maya'] })}
      />
    );

    expect(container.textContent).toContain('waiting on Devon and Maya');
  });

  test('a group with nobody outstanding but no submission reads as a count', () => {
    // Defensive: an empty group, or one whose members were all removed. There is
    // nobody to name, and inventing a name would be worse than the bare count.
    const container = render(
      <GroupSubmitBadge
        status={status({ total: 0, submittedCount: 0, outstanding: [] })}
      />
    );

    expect(container.textContent).toContain('0 of 0 submitted');
    expect(container.textContent).not.toContain('waiting on');
  });

  test('says when the group has submitted', () => {
    const container = render(
      <GroupSubmitBadge
        status={status({
          submittedCount: 3,
          everyoneSubmitted: true,
          outstanding: [],
          submittedAt: '2026-08-22T11:00:00.000Z',
        })}
      />
    );

    expect(container.textContent).toContain('Submitted');
    expect(container.textContent).not.toContain('waiting on');
  });

  test('says when a teacher submitted it for them', () => {
    // Otherwise a bare "Submitted" hides that the group never agreed to it —
    // which matters later, and to a co-teacher who was not there.
    const container = render(
      <GroupSubmitBadge
        status={status({
          submittedCount: 1,
          outstanding: [],
          submittedAt: '2026-08-22T11:00:00.000Z',
          submittedByTeacherName: 'Ms Okonkwo',
        })}
      />
    );

    expect(container.textContent).toContain('submitted for them by Ms Okonkwo');
  });
});
