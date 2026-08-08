import { GlobalRegistrator } from '@happy-dom/global-registrator';

try {
  GlobalRegistrator.register();
} catch {
  // Multiple Bun test files can share the same process.
}

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { afterEach, describe, expect, it } from 'bun:test';
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { ViewPanel, type ViewPanelSubmission } from './view-panel';

function render(element: ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(element);
  });
  return { root };
}

const gradedDailyPages: ViewPanelSubmission = {
  numericPercentage: null,
  letterGrade: null,
  overallScore: 2,
  score: '2/3',
  overallComment: 'You stayed with one idea the whole way through.',
  rubricScores: { engagement: { score: 2, comment: '' } },
  rubricConfig: { minScore: 0, maxScore: 3 },
  document: { assignment: { submitForGrade: true, pointValue: null } },
};

describe('ViewPanel', () => {
  let root: Root | null = null;

  afterEach(() => {
    if (root) act(() => root!.unmount());
    root = null;
    document.body.innerHTML = '';
  });

  it('shows a graded points-scale submission instead of the not-yet-graded state', () => {
    ({ root } = render(<ViewPanel submission={gradedDailyPages} />));

    expect(document.body.textContent).not.toContain('Not yet graded');
    expect(document.body.textContent).toContain('2/3');
  });

  it('shows the overall feedback, which is the whole of a Daily Pages grade', () => {
    ({ root } = render(<ViewPanel submission={gradedDailyPages} />));

    expect(document.body.textContent).toContain(
      'You stayed with one idea the whole way through.'
    );
  });

  it('reports rubric rows against the rubric\'s own scale, not a hardcoded five', () => {
    ({ root } = render(<ViewPanel submission={gradedDailyPages} />));

    expect(document.body.textContent).toContain('2/3');
    expect(document.body.textContent).not.toContain('2/5');
  });

  it('still shows the not-yet-graded state when nothing has been recorded', () => {
    ({ root } = render(
      <ViewPanel
        submission={{
          numericPercentage: null,
          letterGrade: null,
          overallScore: null,
          score: null,
          overallComment: null,
          rubricScores: {},
          document: { assignment: { submitForGrade: true, pointValue: null } },
        }}
      />
    ));

    expect(document.body.textContent).toContain('Not yet graded');
  });

  it('hides a rubric row that was never scored', () => {
    ({ root } = render(
      <ViewPanel
        submission={{
          ...gradedDailyPages,
          rubricScores: {
            engagement: { score: 2, comment: '' },
            reflection: { score: null, comment: '' },
          },
        }}
      />
    ));

    expect(document.body.textContent).not.toContain('Reflection');
  });

  it('still shows a percentage grade the way it always did', () => {
    ({ root } = render(
      <ViewPanel
        submission={{
          numericPercentage: 84,
          letterGrade: 'B',
          overallScore: null,
          score: '84% (B)',
          overallComment: null,
          rubricScores: { thesis_and_content: { score: 4, comment: '' } },
          document: { assignment: { submitForGrade: true, pointValue: null } },
        }}
      />
    ));

    expect(document.body.textContent).toContain('84%');
    expect(document.body.textContent).toContain('4/5');
  });
});
