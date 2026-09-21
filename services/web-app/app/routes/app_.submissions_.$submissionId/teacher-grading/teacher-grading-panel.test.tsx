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

mock.module('~/components/ui/tooltip', () => ({
  Tooltip: ({ children, text }: { children: ReactNode; text: ReactNode }) => (
    <>
      {children}
      <span role="tooltip">{text}</span>
    </>
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
  rubricConfig,
  assistantSuggestion,
  existingGrade,
}: {
  initialGradingAssistantStrictnessLevel?: string | null;
  rubricConfig?: Record<string, unknown>;
  assistantSuggestion?: Record<string, unknown> | null;
  existingGrade?: Record<string, unknown>;
} = {}) {
  return render(
    <TeacherGradingPanel
      documentId="doc-1"
      submissionId="submission-1"
      existingGrade={
        (existingGrade ?? {
          id: 'submission-1',
          score: null,
          feedback: null,
          rubricScores: null,
          overallComment: null,
          numericPercentage: null,
          letterGrade: null,
          releasedAt: null,
        }) as any
      }
      grammarIssues={[]}
      hiddenGrammarIssueIds={[]}
      onToggleGrammarIssue={() => {}}
      onRemoveGrammarIssue={() => {}}
      onGrammarIssuesChange={() => {}}
      initialGradingAssistantStrictnessLevel={
        initialGradingAssistantStrictnessLevel
      }
      rubricConfig={rubricConfig as any}
      assistantSuggestion={assistantSuggestion as any}
    />
  );
}

describe('TeacherGradingPanel', () => {
  let root: Root | null = null;

  afterEach(() => {
    cleanup(root);
    root = null;
  });

  it('renders the strictness picker for a teacher', async () => {
    ({ root } = renderPanel());

    const menu = document.querySelector<HTMLButtonElement>(
      '[data-testid="grading-assistant-strictness-menu"]'
    );
    expect(menu).not.toBeNull();

    for (const level of ['beginner', 'intermediate', 'advanced']) {
      expect(
        document.querySelector(
          `[data-testid="grading-assistant-strictness-${level}"]`
        )
      ).not.toBeNull();
    }

    const beginner = document.querySelector<HTMLButtonElement>(
      '[data-testid="grading-assistant-strictness-beginner"]'
    );
    expect(beginner?.getAttribute('aria-pressed')).toBe('true');
  });

  it('explains each level as a reading posture on hover, never as a point adjustment', async () => {
    ({ root } = renderPanel());

    // The tooltip mock renders its text inline, so the hover copy lands in
    // the DOM without simulating a pointer.
    expect(document.body.textContent).toContain(
      'The assistant reads gently, expecting a writer still learning the fundamentals.'
    );
    expect(document.body.textContent).toContain(
      'The assistant reads at the standard expected for the grade level.'
    );
    expect(document.body.textContent).toContain(
      'The assistant reads demandingly, expecting polished and precise writing.'
    );
    for (const tooltip of document.querySelectorAll('[role="tooltip"]')) {
      expect(tooltip.textContent).not.toContain('points');
    }
  });

  it('applies the assignment strictness level to a grading run', async () => {
    ({ root } = renderPanel({
      initialGradingAssistantStrictnessLevel: 'advanced',
    }));

    const generate = document.querySelector<HTMLButtonElement>(
      '[data-testid="grading-assistant-generate"]'
    );

    act(() => {
      generate?.click();
    });

    expect(submit).toHaveBeenCalledTimes(1);
    const form = submit.mock.calls[0][0] as FormData;
    // Restoring the picker and its copy must not disturb the scoring path --
    // the assignment's stored "advanced" strictness still flows through.
    expect(form.get('gradingAssistantStrictnessLevel')).toBe('advanced');
  });

  it('warns the teacher when the assignment type rubric has incomplete categories', async () => {
    ({ root } = renderPanel({
      rubricConfig: {
        source: 'assignment-type',
        rubricIncomplete: true,
        minScore: 1,
        maxScore: 5,
        scoringType: 'weighted_1_5',
        categories: [
          {
            key: 'claim',
            label: 'Claim',
            description: 'A clear defensible claim.',
            weight: 0.5,
          },
          {
            key: 'evidence',
            label: 'Evidence',
            description: '',
            weight: 0.5,
          },
        ],
      },
    }));

    const banner = document.querySelector(
      '[data-testid="teacher-grading-rubric-incomplete-warning"]'
    );
    expect(banner).not.toBeNull();
    expect(banner?.textContent).toContain('incomplete');
  });

  it('offers no reset when the assistant has never run on this submission', async () => {
    ({ root } = renderPanel());

    expect(
      document.querySelector(
        '[data-testid="grading-reset-to-assistant-suggestions"]'
      )
    ).toBeNull();
  });

  it('puts the assistant suggestions back over a teacher edit', async () => {
    ({ root } = renderPanel({
      existingGrade: {
        id: 'submission-1',
        score: null,
        feedback: null,
        rubricScores: { claim: { score: 2, comment: 'Teacher rewrote this.' } },
        overallComment: 'Teacher wrote their own feedback.',
        numericPercentage: 55,
        letterGrade: 'F',
        releasedAt: null,
      },
      rubricConfig: {
        source: 'assignment-type',
        minScore: 1,
        maxScore: 5,
        scoringType: 'weighted_1_5',
        categories: [
          {
            key: 'claim',
            label: 'Claim',
            description: 'A clear defensible claim.',
            weight: 1,
          },
        ],
      },
      assistantSuggestion: {
        rubricScores: { claim: { score: 5, comment: 'Assistant said this.' } },
        overallComment: 'Assistant feedback.',
        // The assistant's score follows its own rubric scores, which is why
        // the restored total tracks the restored categories.
        numericPercentage: 100,
        score: null,
        letterGrade: 'A',
        grammarIssues: null,
      },
    }));

    const totalPoints = document.querySelector<HTMLInputElement>(
      '[data-testid="grading-overall-points"]'
    );
    expect(totalPoints?.value).toBe('55');
    expect(document.body.textContent).toContain('Total points (out of 100)');

    const reset = document.querySelector<HTMLButtonElement>(
      '[data-testid="grading-reset-to-assistant-suggestions"]'
    );
    expect(reset).not.toBeNull();

    act(() => {
      reset?.click();
    });

    expect(
      document.querySelector<HTMLInputElement>(
        '[data-testid="grading-overall-points"]'
      )?.value
    ).toBe('100');
    expect(
      document.querySelector<HTMLTextAreaElement>(
        '[data-testid="grading-overall-comment"]'
      )?.value
    ).toBe('Assistant feedback.');
  });
});
