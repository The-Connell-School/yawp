import { GlobalRegistrator } from '@happy-dom/global-registrator';

try {
  GlobalRegistrator.register();
} catch {}

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { PracticeRunner, type PracticeRunnerItem } from './practice-runner';

let root: Root | null = null;
let originalDateTimeFormat: typeof Intl.DateTimeFormat;

// Minimal react-router mocks for components that expect a data router.
mock.module('react-router', () => {
  const Link = ({ to, children }: { to: string; children: ReactElement | string }) => (
    <a href={to}>{children}</a>
  );
  const Form = ({ children, ...props }: { children: ReactElement | string }) => (
    <form {...props}>{children}</form>
  );
  function useFetcher() {
    return {
      Form,
      state: 'idle',
      data: null,
      submit: () => {},
    };
  }
  return { Link, useFetcher };
});

function render(element: ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(element);
  });
}

beforeEach(() => {
  originalDateTimeFormat = Intl.DateTimeFormat;
  // Force a default local timezone with negative offset (America/Chicago)
  // so midnight-UTC dates would otherwise render the previous day.
  // Only applies when no explicit timeZone is provided.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (Intl as any).DateTimeFormat = function (locales?: any, options?: any) {
    const merged = { ...(options ?? {}), timeZone: options?.timeZone ?? 'America/Chicago' };
    // eslint-disable-next-line new-cap
    return new originalDateTimeFormat(locales as any, merged as any);
  } as unknown as typeof Intl.DateTimeFormat;
});

afterEach(() => {
  if (root) {
    act(() => {
      root!.unmount();
    });
    root = null;
  }
  document.body.innerHTML = '';
  Intl.DateTimeFormat = originalDateTimeFormat;
});

describe('PracticeRunner due date displays a stable calendar day', () => {
  it('shows the same calendar day for a date-only dueAt regardless of local timezone', () => {
    const items: PracticeRunnerItem[] = [
      {
        position: 1,
        lessonSlug: 'fixing-comma-splices',
        lessonTitle: 'Fixing Comma Splices',
        initialStatus: 'todo',
        kind: 'composition',
        prompt: { id: 'p1', exercise: 'X', instruction: 'Y' },
      },
    ];

    render(
      <PracticeRunner
        eyebrow="Assigned practice"
        title="Fixing Comma Splices"
        instructions={null}
        dueAt="2026-10-05T00:00:00.000Z"
        headerBadges={null}
        problemCount={1}
        items={items}
        hasComposition={true}
        backTo="/app"
        backLabel="Back"
        reviewFrom="/app"
        lessonRecaps={[]}
      />
    );

    const text = document.body.textContent ?? '';
    // If the component uses local time, America/Chicago would render Oct 4 here.
    expect(text).toContain('Due Oct 5, 2026');
  });
});

