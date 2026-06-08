import { GlobalRegistrator } from '@happy-dom/global-registrator';

try {
  GlobalRegistrator.register();
} catch {
  // Multiple Bun test files can share the same process.
}

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { afterEach, describe, expect, it, mock } from 'bun:test';
import { act, type ReactElement } from 'react';
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

  it('opens strictness cards and submits the teacher-selected level', async () => {
    ({ root } = renderPanel());

    const menu = document.querySelector<HTMLButtonElement>(
      '[data-testid="grading-assistant-strictness-menu"]'
    );
    expect(menu).not.toBeNull();

    await act(async () => {
      menu?.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const beginner = document.querySelector<HTMLButtonElement>(
      '[data-testid="grading-assistant-strictness-beginner"]'
    );
    const advanced = document.querySelector<HTMLButtonElement>(
      '[data-testid="grading-assistant-strictness-advanced"]'
    );
    const generate = document.querySelector<HTMLButtonElement>(
      '[data-testid="grading-assistant-generate"]'
    );

    expect(document.body.textContent).toContain(
      'Use a more supportive calibration for younger students, early-year work, or first attempts.'
    );
    expect(document.body.textContent).toContain(
      'Use the normal course-level expectation for this assignment and rubric.'
    );
    expect(document.body.textContent).toContain(
      'Use a stricter calibration for older students, upper-level classes, or raised standards.'
    );
    expect(beginner?.getAttribute('aria-pressed')).toBe('true');

    act(() => {
      advanced?.click();
    });

    expect(advanced?.getAttribute('aria-pressed')).toBe('true');

    act(() => {
      generate?.click();
    });

    expect(submit).toHaveBeenCalledTimes(1);
    const form = submit.mock.calls[0][0] as FormData;
    expect(form.get('submissionId')).toBe('submission-1');
    expect(form.get('gradingAssistantStrictnessLevel')).toBe('advanced');
  });

  it('defaults to the assignment strictness level for a grading run', async () => {
    ({ root } = renderPanel({
      initialGradingAssistantStrictnessLevel: 'advanced',
    }));

    const menu = document.querySelector<HTMLButtonElement>(
      '[data-testid="grading-assistant-strictness-menu"]'
    );
    expect(menu?.getAttribute('aria-label')).toBe(
      'Grading assistant strictness: Advanced'
    );

    await act(async () => {
      menu?.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const advanced = document.querySelector<HTMLButtonElement>(
      '[data-testid="grading-assistant-strictness-advanced"]'
    );
    const generate = document.querySelector<HTMLButtonElement>(
      '[data-testid="grading-assistant-generate"]'
    );

    expect(advanced?.getAttribute('aria-pressed')).toBe('true');

    act(() => {
      generate?.click();
    });

    expect(submit).toHaveBeenCalledTimes(1);
    const form = submit.mock.calls[0][0] as FormData;
    expect(form.get('gradingAssistantStrictnessLevel')).toBe('advanced');
  });
});
