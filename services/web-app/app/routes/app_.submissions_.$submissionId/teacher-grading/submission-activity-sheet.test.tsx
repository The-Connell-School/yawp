import { GlobalRegistrator } from '@happy-dom/global-registrator';

try {
  GlobalRegistrator.register();
} catch {
  // Multiple Bun test files can share the same process.
}

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { afterEach, describe, expect, test, mock } from 'bun:test';
import { act, type ReactElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';

mock.module('~/components/ui/sheet', () => ({
  Sheet: ({ children }: { children: ReactNode }) => <>{children}</>,
  SheetTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  SheetContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  SheetHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SheetTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
  SheetDescription: ({ children }: { children: ReactNode }) => (
    <p>{children}</p>
  ),
}));

const { SubmissionActivitySheet } = await import('./submission-activity-sheet');

let root: Root | null = null;

function render(element: ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root?.render(element));
}

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = '';
});

describe('SubmissionActivitySheet', () => {
  test('shows actor, exact time, post-release state, and readable before/after values', () => {
    render(
      <SubmissionActivitySheet
        activities={[
          {
            id: 'activity-1',
            eventType: 'submission.grade_updated',
            source: 'update-submission',
            occurredAfterRelease: true,
            changes: {
              score: { before: '85% B', after: '92% A-' },
            },
            metadata: null,
            createdAt: '2026-08-20T12:34:56.000Z',
            actorType: 'human',
            actorName: 'Teacher One',
            actorEmail: 'teacher@example.test',
            actorMembership: {
              user: {
                name: 'Teacher One',
                email: 'teacher@example.test',
              },
            },
          },
        ]}
      />
    );

    expect(document.body.textContent).toContain('Submission Activity');
    expect(document.body.textContent).toContain('Grade or feedback changed');
    expect(document.body.textContent).toContain('Teacher One');
    expect(document.body.textContent).toContain('After release');
    expect(document.body.textContent).toContain('85% B');
    expect(document.body.textContent).toContain('92% A-');
    expect(document.querySelector('time')?.getAttribute('datetime')).toBe(
      '2026-08-20T12:34:56.000Z'
    );
  });

  test('uses System when no actor can be attributed', () => {
    render(
      <SubmissionActivitySheet
        activities={[
          {
            id: 'activity-2',
            eventType: 'submission.created',
            source: 'migration',
            occurredAfterRelease: false,
            changes: {},
            metadata: null,
            createdAt: '2026-08-20T12:00:00.000Z',
            actorType: 'system',
            actorName: null,
            actorEmail: null,
            actorMembership: null,
          },
        ]}
      />
    );

    expect(document.body.textContent).toContain('System');
  });

  test('renders nested rubric and grammar changes as readable lines', () => {
    render(
      <SubmissionActivitySheet
        activities={[
          {
            id: 'activity-3',
            eventType: 'submission.grade_updated',
            source: 'update-submission',
            occurredAfterRelease: true,
            changes: {
              rubricScores: {
                before: { thesis_and_content: { score: 3, comment: '' } },
                after: {
                  thesis_and_content: { score: 5, comment: 'Clear claim' },
                },
              },
              grammarIssues: {
                before: { version: 1, issues: [] },
                after: {
                  version: 1,
                  issues: [
                    {
                      kind: 'comma_splice',
                      excerpt: 'rain, we left',
                      message: 'Use a period or conjunction.',
                    },
                  ],
                },
              },
            },
            metadata: null,
            createdAt: '2026-08-20T12:34:56.000Z',
            actorType: 'human',
            actorName: 'Teacher One',
            actorEmail: 'teacher@example.test',
            actorMembership: null,
          },
        ]}
      />
    );

    expect(document.body.textContent).toContain('Thesis and content: 3');
    expect(document.body.textContent).toContain(
      'Thesis and content: 5 — Clear claim'
    );
    expect(document.body.textContent).toContain(
      'Comma splice: “rain, we left” — Use a period or conjunction.'
    );
  });
});
