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
      <span>{text}</span>
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
}: {
  initialGradingAssistantStrictnessLevel?: string | null;
  rubricConfig?: Record<string, unknown>;
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
      rubricConfig={rubricConfig as any}
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
    expect(document.body.textContent).not.toContain('points');
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

  it('warns the teacher when the thesis-driven-essay rubric is applied instead of this assignment type\'s own', async () => {
    ({ root } = renderPanel({
      rubricConfig: {
        source: 'thesis-default',
        minScore: 1,
        maxScore: 5,
        scoringType: 'weighted_1_5',
        categories: [
          {
            key: 'thesis_and_content',
            label: 'Thesis/Content',
            description: 'Thesis quality.',
            weight: 0.25,
          },
        ],
      },
    }));

    const banner = document.querySelector(
      '[data-testid="teacher-grading-rubric-source-warning"]'
    );
    expect(banner).not.toBeNull();
    expect(banner?.textContent).toContain('thesis-driven essay');
  });

  it('does not show the fallback warning when the assignment type owns its rubric', async () => {
    ({ root } = renderPanel({
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
    }));

    const banner = document.querySelector(
      '[data-testid="teacher-grading-rubric-source-warning"]'
    );
    expect(banner).toBeNull();
  });
});
