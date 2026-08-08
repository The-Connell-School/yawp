import { GlobalRegistrator } from '@happy-dom/global-registrator';

try {
  GlobalRegistrator.register();
} catch {
  // Multiple Bun test files can share the same process.
}

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { afterEach, describe, expect, it, mock } from 'bun:test';
import { act, type ReactElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';

const submit = mock();
const actualReactRouter = await import('react-router');

mock.module('react-router', () => ({
  ...actualReactRouter,
  useFetcher: () => ({
    state: 'idle',
    data: null,
    submit,
  }),
}));

mock.module('./use-update-submission', () => ({
  useUpdateSubmission: () => ({
    save: () => {},
    status: 'idle',
  }),
}));

mock.module('~/components/ui/popover', () => ({
  Popover: ({ children }: { children: ReactNode }) => <>{children}</>,
  PopoverTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  PopoverContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
}));

const { TeacherGradingPanel } = await import('./teacher-grading-panel');

function render(element: ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(element);
  });

  return { root };
}

function cleanup(root: Root | null) {
  if (root) {
    act(() => {
      root.unmount();
    });
  }
  document.body.innerHTML = '';
  submit.mockReset();
}

function renderPanel({
  initialGradingAssistantStrictnessLevel = 'beginner',
}: {
  initialGradingAssistantStrictnessLevel?: string | null;
} = {}) {
  return render(
    <TeacherGradingPanel
      documentId="doc-1"
      submissionId="submission-1"
      existingGrade={{
        id: 'submission-1',
        score: null,
        feedback: null,
        rubricScores: null,
        overallComment: null,
        numericPercentage: null,
        letterGrade: null,
        releasedAt: null,
      }}
      grammarIssues={[]}
      hiddenGrammarIssueIds={[]}
      onToggleGrammarIssue={() => {}}
      onRemoveGrammarIssue={() => {}}
      onGrammarIssuesChange={() => {}}
      initialGradingAssistantStrictnessLevel={
        initialGradingAssistantStrictnessLevel
      }
    />
  );
}

describe('TeacherGradingPanel', () => {
  let root: Root | null = null;

  afterEach(() => {
    cleanup(root);
    root = null;
  });

  it('does not render the strictness picker for a teacher', async () => {
    ({ root } = renderPanel());

    const menu = document.querySelector<HTMLButtonElement>(
      '[data-testid="grading-assistant-strictness-menu"]'
    );
    expect(menu).toBeNull();

    const generate = document.querySelector<HTMLButtonElement>(
      '[data-testid="grading-assistant-generate"]'
    );
    expect(generate).not.toBeNull();
  });

  it('still applies the assignment strictness level to a grading run with the picker hidden', async () => {
    ({ root } = renderPanel({
      initialGradingAssistantStrictnessLevel: 'advanced',
    }));

    // The picker is hidden, so a teacher has no way to change the level --
    // clicking "Generate" is the only available action.
    expect(
      document.querySelector('[data-testid="grading-assistant-strictness-menu"]')
    ).toBeNull();

    const generate = document.querySelector<HTMLButtonElement>(
      '[data-testid="grading-assistant-generate"]'
    );

    act(() => {
      generate?.click();
    });

    expect(submit).toHaveBeenCalledTimes(1);
    const form = submit.mock.calls[0][0] as FormData;
    // The assignment's stored "advanced" strictness (±5 percentage / ±1 ACT
    // composite, applied server-side) still flows through even though the
    // teacher never saw or touched a strictness control.
    expect(form.get('gradingAssistantStrictnessLevel')).toBe('advanced');
  });
});
