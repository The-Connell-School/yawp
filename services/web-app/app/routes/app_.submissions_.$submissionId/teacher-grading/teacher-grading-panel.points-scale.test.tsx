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
  useFetcher: () => ({ state: 'idle', data: null, submit }),
}));

const savedPayloads: Array<Record<string, unknown>> = [];

mock.module('./use-update-submission', () => ({
  useUpdateSubmission: () => ({
    save: (payload: Record<string, unknown>) => {
      savedPayloads.push(payload);
      return Promise.resolve();
    },
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
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

const { TeacherGradingPanel } = await import('./teacher-grading-panel');

const dailyPagesConfig = {
  source: 'assignment-type',
  minScore: 0,
  maxScore: 3,
  scoringType: 'points_scale',
  categories: [
    {
      key: 'engagement',
      label: 'Engagement',
      description: 'How fully the student showed up.',
      weight: 1,
      feedbackEnabled: false,
      scoreLabels: [
        { value: 0, label: 'Absent' },
        { value: 1, label: 'Hardly there' },
        { value: 2, label: 'Showed up' },
        { value: 3, label: 'All in' },
      ],
    },
  ],
};

const actConfig = {
  source: 'assignment-type',
  minScore: 1,
  maxScore: 6,
  scoringType: 'act_writing_2_12',
  categories: [
    { key: 'ideas', label: 'Ideas', description: '', weight: 1 },
    { key: 'organization', label: 'Organization', description: '', weight: 1 },
  ],
};

function render(element: ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(element);
  });
  return { root };
}

function renderPanel({
  rubricConfig,
  existingGrade,
  pointValue,
}: {
  pointValue?: number;
  rubricConfig: Record<string, unknown>;
  existingGrade?: Record<string, unknown>;
}) {
  return render(
    <TeacherGradingPanel
      pointValue={pointValue}
      documentId="doc-1"
      submissionId="submission-1"
      existingGrade={
        {
          id: 'submission-1',
          score: null,
          feedback: null,
          rubricScores: null,
          overallComment: null,
          numericPercentage: null,
          letterGrade: null,
          releasedAt: null,
          ...existingGrade,
        } as any
      }
      grammarIssues={[]}
      hiddenGrammarIssueIds={[]}
      onToggleGrammarIssue={() => {}}
      onRemoveGrammarIssue={() => {}}
      onGrammarIssuesChange={() => {}}
      rubricConfig={rubricConfig as any}
    />
  );
}

/** Blurring the overall feedback box is the panel's plainest save trigger. */
function saveViaOverallFeedback(text: string) {
  const textarea = document.querySelector<HTMLTextAreaElement>(
    '[data-testid="grading-overall-comment"]'
  );
  act(() => {
    textarea!.value = text;
    textarea!.dispatchEvent(new Event('focusout', { bubbles: true }));
  });
}

function lastPayload() {
  return savedPayloads[savedPayloads.length - 1];
}

describe('TeacherGradingPanel on a points scale', () => {
  let root: Root | null = null;

  afterEach(() => {
    if (root) act(() => root!.unmount());
    root = null;
    document.body.innerHTML = '';
    savedPayloads.length = 0;
    submit.mockReset();
  });

  // A recorded total that disagrees with the category scores is the teacher's
  // own: saving always writes the two together, so the only way they diverge
  // is somebody typing a total. Reopening the form keeps it rather than
  // quietly recomputing one.
  it('keeps a recorded total that the category scores no longer add up to', () => {
    ({ root } = renderPanel({
      rubricConfig: dailyPagesConfig,
      existingGrade: {
        score: '3/3',
        rubricScores: { engagement: { score: 1, comment: '' } },
      },
    }));

    saveViaOverallFeedback('Nice work.');

    expect(lastPayload()).toMatchObject({ score: '3/3', overallScore: 3 });
  });

  it('scales saved raw totals and preserves bands as points while saving feedback', () => {
    ({ root } = renderPanel({
      pointValue: 90,
      rubricConfig: { ...dailyPagesConfig, maxScore: 30, step: 1, categories: [{
        ...dailyPagesConfig.categories[0], scoreLabels: undefined,
        bands: [{ label: 'Showed up', min: 17, max: 23, description: '' }],
      }] },
      existingGrade: { score: '18/30', rubricScores: { engagement: { score: 18, comment: '' } } },
    }));
    expect(document.body.textContent).toContain('Total points (out of 90)');
    expect(document.body.textContent).not.toContain('%');
    saveViaOverallFeedback('Kept engagement.');
    expect(lastPayload()).toMatchObject({ score: '54/90', overallScore: 54 });
    expect(lastPayload().numericPercentage ?? null).toBeNull();
  });

  it('records a grade even when the assistant never graded the submission first', () => {
    ({ root } = renderPanel({
      rubricConfig: dailyPagesConfig,
      existingGrade: {
        score: null,
        rubricScores: { engagement: { score: 2, comment: '' } },
      },
    }));

    saveViaOverallFeedback('Keep going.');

    expect(lastPayload()).toMatchObject({ score: '2/3', overallScore: 2 });
  });

  it('records Absent as a real score of zero', () => {
    ({ root } = renderPanel({
      rubricConfig: dailyPagesConfig,
      existingGrade: {
        rubricScores: { engagement: { score: 0, comment: '' } },
      },
    }));

    saveViaOverallFeedback('Nothing to read here.');

    expect(lastPayload()).toMatchObject({ score: '0/3', overallScore: 0 });
  });

  it('does not rewrite an untouched unscored rubric during a feedback edit', () => {
    ({ root } = renderPanel({ rubricConfig: dailyPagesConfig }));

    saveViaOverallFeedback('Started reading.');

    const payload = lastPayload();
    expect(payload.rubricScores).toBeUndefined();
    // An unscored rubric produces no grade at all.
    expect(payload.overallScore).toBeUndefined();
    expect(payload.score).toBeUndefined();
  });

  it('shows the points grade in the panel header instead of a dash', () => {
    ({ root } = renderPanel({
      rubricConfig: dailyPagesConfig,
      existingGrade: {
        score: '3/3',
        rubricScores: { engagement: { score: 1, comment: '' } },
      },
    }));

    const badge = document.querySelector('[data-testid="grading-grade-badge"]');
    expect(badge?.textContent).toBe('3/3');
  });
});

describe('TeacherGradingPanel on the ACT writing scale', () => {
  let root: Root | null = null;

  afterEach(() => {
    if (root) act(() => root!.unmount());
    root = null;
    document.body.innerHTML = '';
    savedPayloads.length = 0;
    submit.mockReset();
  });

  // Same rule as the points scale: a recorded composite that the categories no
  // longer add up to is one somebody entered, so reopening keeps it. Rescoring
  // a category in the panel is what returns the total to the categories.
  it('keeps a recorded composite the category scores no longer add up to', () => {
    ({ root } = renderPanel({
      rubricConfig: actConfig,
      existingGrade: {
        score: '6/12',
        rubricScores: {
          ideas: { score: 5, comment: '' },
          organization: { score: 4, comment: '' },
        },
      },
    }));

    saveViaOverallFeedback('Solid argument.');

    expect(lastPayload()).toMatchObject({ score: '6/12', overallScore: 6 });
  });
});
