import { GlobalRegistrator } from '@happy-dom/global-registrator';

try {
  GlobalRegistrator.register();
} catch {
  // Multiple Bun test files can share the same process.
}

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { afterEach, describe, expect, test } from 'bun:test';
import { act, type ReactElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { GroupSubmitBanner, GroupSubmitButton } from './group-submit';
import { summarizeGroupSubmitReadiness } from '~/domain/collaboration/submit-readiness';

/**
 * What a student is told about a submission that has not happened yet.
 *
 * The rule is that every member presses before the draft goes to the teacher.
 * The failure mode is not the rule breaking — it is a student pressing once,
 * reading "Submitted", and walking away from a draft that is still sitting with
 * their group. So these tests are mostly about wording.
 */

let root: Root | null = null;

/** No router: the button takes anything shaped like a fetcher, so a plain form
 * stands in and these tests need no route context. */
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

const fetcher = {
  Form: ({ children, ...props }: { children?: ReactNode }) => (
    <form {...props}>{children}</form>
  ),
  state: 'idle' as const,
};

const stateFor = (
  entries: [id: string, name: string, submitted: boolean][],
  viewerMembershipId: string,
  submittedAt: string | null = null,
  submittedByTeacherName: string | null = null
) => ({
  submittedByTeacherName,
  readiness: summarizeGroupSubmitReadiness({
    members: entries.map(([membershipId, name, submitted]) => ({
      membershipId,
      name,
      submittedAt: submitted ? '2026-08-22T10:00:00.000Z' : null,
    })),
    viewerMembershipId,
  }),
  submittedAt,
});

const GROUP_OF_THREE: [string, string, boolean][] = [
  ['m1', 'Sam Reyes', false],
  ['m2', 'Taylor Nguyen', false],
  ['m3', 'Alex Diaz', false],
];

describe('GroupSubmitButton', () => {
  test('says what the press actually does on a group draft', () => {
    const container = render(
      <GroupSubmitButton
        docId="doc-1"
        fetcher={fetcher}
        state={stateFor(GROUP_OF_THREE, 'm1')}
      />
    );

    // Not "Submit": on a draft three people are writing, that reads as
    // submitting the whole thing.
    expect(container.textContent).toContain('Submit my part');
  });

  test('a shared draft with one writer keeps the plain label', () => {
    const container = render(
      <GroupSubmitButton
        docId="doc-1"
        fetcher={fetcher}
        state={stateFor([['m1', 'Sam Reyes', false]], 'm1')}
      />
    );

    expect(container.textContent).toContain('Submit');
    expect(container.textContent).not.toContain('my part');
  });

  test('posts to the group submit endpoint with the submit intent', () => {
    const container = render(
      <GroupSubmitButton
        docId="doc-1"
        fetcher={fetcher}
        state={stateFor(GROUP_OF_THREE, 'm1')}
      />
    );

    const form = container.querySelector('form')!;
    expect(form.getAttribute('action')).toBe('/api/collab/doc-1/submit');
    expect(
      container.querySelector('input[name="intent"]')?.getAttribute('value')
    ).toBe('submit');
  });

  test('offers a way back out after pressing, while the group is still waiting', () => {
    // A student who pressed too early should not need a teacher to undo it.
    const container = render(
      <GroupSubmitButton
        docId="doc-1"
        fetcher={fetcher}
        state={stateFor(
          [
            ['m1', 'Sam Reyes', true],
            ['m2', 'Taylor Nguyen', false],
          ],
          'm1'
        )}
      />
    );

    expect(container.textContent).toContain('You submitted');
    expect(container.textContent).toContain('Undo my submit');
    expect(
      container.querySelector('input[name="intent"]')?.getAttribute('value')
    ).toBe('withdraw');
  });

  test('offers no undo once the whole group has submitted', () => {
    const container = render(
      <GroupSubmitButton
        docId="doc-1"
        fetcher={fetcher}
        state={stateFor(
          [
            ['m1', 'Sam Reyes', true],
            ['m2', 'Taylor Nguyen', true],
          ],
          'm1',
          '2026-08-22T11:00:00.000Z'
        )}
      />
    );

    expect(container.textContent).toContain('Submitted');
    expect(container.textContent).not.toContain('Undo');
    expect(container.querySelector('button')?.disabled).toBe(true);
  });
});

describe('GroupSubmitBanner', () => {
  test('never lets a partly-pressed draft read as submitted', () => {
    const container = render(
      <GroupSubmitBanner
        state={stateFor(
          [
            ['m1', 'Sam Reyes', true],
            ['m2', 'Taylor Nguyen', false],
            ['m3', 'Alex Diaz', false],
          ],
          'm1'
        )}
      />
    );

    expect(container.textContent).toContain('Not submitted yet');
    expect(container.textContent).toContain('1 of 3');
  });

  test('names who the group is still waiting on', () => {
    const container = render(
      <GroupSubmitBanner
        state={stateFor(
          [
            ['m1', 'Sam Reyes', true],
            ['m2', 'Taylor Nguyen', false],
            ['m3', 'Alex Diaz', false],
          ],
          'm1'
        )}
      />
    );

    expect(container.textContent).toContain('Taylor Nguyen');
    expect(container.textContent).toContain('Alex Diaz');
  });

  test('marks which of those people is you', () => {
    const container = render(
      <GroupSubmitBanner state={stateFor(GROUP_OF_THREE, 'm2')} />
    );

    const you = [...container.querySelectorAll('li')].find((item) =>
      item.textContent?.includes('Taylor Nguyen')
    );
    expect(you?.textContent).toContain('(you)');
  });

  test('spells the state out for a screen reader, not only in an icon', () => {
    const container = render(
      <GroupSubmitBanner
        state={stateFor(
          [
            ['m1', 'Sam Reyes', true],
            ['m2', 'Taylor Nguyen', false],
          ],
          'm2'
        )}
      />
    );

    const labels = [...container.querySelectorAll('li')].map((item) =>
      item.getAttribute('aria-label')
    );
    expect(labels).toEqual([
      'Sam Reyes: submitted',
      'Taylor Nguyen (you): not submitted yet',
    ]);
  });

  test('confirms the hand-in once everyone has pressed', () => {
    const container = render(
      <GroupSubmitBanner
        state={stateFor(
          [
            ['m1', 'Sam Reyes', true],
            ['m2', 'Taylor Nguyen', true],
          ],
          'm1',
          '2026-08-22T11:00:00.000Z'
        )}
      />
    );

    expect(container.textContent).toContain('Submitted to your teacher');
    expect(container.textContent).toContain('Everyone in your group');
  });

  test('does not tell a teacher reading the draft that it is "your group"', () => {
    const container = render(
      <GroupSubmitBanner state={stateFor(GROUP_OF_THREE, 'teacher-1')} />
    );

    expect(container.textContent).toContain('in this group');
    expect(container.textContent).not.toContain('your group');
  });

  test('says when a teacher submitted the draft for the group', () => {
    // The one case where the draft went in without the group agreeing. Reading
    // "Submitted to your teacher" here would hide who ended their editing.
    const container = render(
      <GroupSubmitBanner
        state={stateFor(
          [
            ['m1', 'Sam Reyes', true],
            ['m2', 'Taylor Nguyen', false],
          ],
          'm2',
          '2026-08-22T11:00:00.000Z',
          'Ms Okonkwo'
        )}
      />
    );

    expect(container.textContent).toContain(
      'Ms Okonkwo submitted this draft for your group'
    );
    expect(container.textContent).toContain(
      'What your group had written by then is what your teacher has'
    );
  });

  test('stays out of the way on a draft with one writer', () => {
    const container = render(
      <GroupSubmitBanner state={stateFor([['m1', 'Sam Reyes', false]], 'm1')} />
    );

    expect(container.textContent).toBe('');
  });

  test('announces itself politely, so a press by a classmate is read out', () => {
    const container = render(
      <GroupSubmitBanner state={stateFor(GROUP_OF_THREE, 'm1')} />
    );

    expect(container.querySelector('[role="status"]')).not.toBeNull();
  });
});
