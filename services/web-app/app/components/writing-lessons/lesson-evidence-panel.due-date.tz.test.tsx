import { GlobalRegistrator } from '@happy-dom/global-registrator';

try {
  GlobalRegistrator.register();
} catch {}

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { LessonEvidencePanel } from './lesson-evidence-panel';
import type { LessonEvidence } from '~/utils/writing-lessons/lesson-evidence';

let root: Root | null = null;
let originalDateTimeFormat: typeof Intl.DateTimeFormat;

// Mock react-router Link to avoid requiring a Router in tests.
mock.module('react-router', () => ({
  Link: ({ to, children }: { to: string; children: ReactElement | string }) => (
    <a href={to}>{children}</a>
  ),
}));

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
  // Force default timezone to America/Chicago when not explicitly set.
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

describe('LessonEvidencePanel due date displays a stable calendar day', () => {
  it('shows the same calendar day for a date-only dueAt regardless of local timezone', () => {
    const evidence: LessonEvidence = {
      classes: [
        {
          classAssignmentId: 'ca1',
          classLabel: 'Period 2 — ELA',
          assignmentTitle: 'Fixing Comma Splices',
          dueAt: '2026-10-05T00:00:00.000Z',
          studentCount: 25,
          practicedCount: 0,
          answeredCount: 0,
          correctCount: 0,
          masteredCount: 0,
          revisingCount: 0,
        },
      ],
      studentsPracticed: 0,
      answeredCount: 0,
      correctCount: 0,
      masteredCount: 0,
      revisingCount: 0,
      misses: [],
    };

    render(<LessonEvidencePanel evidence={evidence} isComposition={false} />);

    const text = document.body.textContent ?? '';
    expect(text).toContain('Due Oct 5');
  });
});

