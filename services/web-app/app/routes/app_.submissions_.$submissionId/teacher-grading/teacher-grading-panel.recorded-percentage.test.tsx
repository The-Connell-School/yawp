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

import {
  DAILY_PAGES_SHORT_FORM_RUBRIC,
  DAILY_PAGES_SHORT_FORM_SCORING_SCALE,
} from '~/domain/assignment-types/daily-pages-short-form-rubric';

// The rubric a seeded or earlier Daily Pages grade was scored on: five
// categories on 1-5, each declaring a band per score.
const shortFormConfig = {
  source: 'grading-run',
  minScore: DAILY_PAGES_SHORT_FORM_SCORING_SCALE.minScore,
  maxScore: DAILY_PAGES_SHORT_FORM_SCORING_SCALE.maxScore,
  step: DAILY_PAGES_SHORT_FORM_SCORING_SCALE.step,
  scoringType: DAILY_PAGES_SHORT_FORM_SCORING_SCALE.type,
  categories: DAILY_PAGES_SHORT_FORM_RUBRIC.categories,
};

const recordedGrade = {
  score: '44% (F)',
  numericPercentage: 44,
  letterGrade: 'F',
  overallComment: 'Announces a claim instead of making one.',
  rubricScores: {
    depth_of_thought: { score: 2, comment: '', isAi: true },
    development_of_thought: { score: 2, comment: '', isAi: true },
    organization_and_structure: { score: 2, comment: '', isAi: true },
    voice_and_style: { score: 3, comment: '', isAi: true },
    grammar_and_mechanics: { score: 2, comment: '', isAi: true },
  },
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

describe('TeacherGradingPanel reopening a recorded percentage grade', () => {
  let root: Root | null = null;

  afterEach(() => {
    if (root) act(() => root!.unmount());
    root = null;
    document.body.innerHTML = '';
    savedPayloads.length = 0;
    submit.mockReset();
  });

  // Opening Edit and saving without touching anything used to write 0/100
  // over a 44/100 grade: the total field opened at 0 and Save persisted it.
  it('opens the total at the recorded grade', () => {
    ({ root } = renderPanel({
      pointValue: 100,
      rubricConfig: shortFormConfig,
      existingGrade: recordedGrade,
    }));

    const total = document.querySelector<HTMLInputElement>(
      '[data-testid="grading-overall-points"]'
    );
    expect(total?.value).toBe('44');
  });

  it('keeps the recorded grade when only the feedback is saved', () => {
    ({ root } = renderPanel({
      pointValue: 100,
      rubricConfig: shortFormConfig,
      existingGrade: recordedGrade,
    }));

    saveViaOverallFeedback('Announces a claim instead of making one.');

    const payload = lastPayload();
    expect(payload).toBeDefined();
    expect(payload.numericPercentage).toBe(44);
    expect(payload.overallScore).not.toBe(0);
    expect(payload.score).not.toBe('0/100');
  });
});
