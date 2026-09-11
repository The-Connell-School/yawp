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

const { ViewPanel } = await import('./view-panel');

let root: Root | null = null;

function render(element: ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(element);
  });
}

function text() {
  return document.body.textContent ?? '';
}

afterEach(() => {
  if (root) act(() => root!.unmount());
  root = null;
  document.body.innerHTML = '';
});

/** An exit ticket read for understanding, deliberately not for points. */
const feedbackOnlySubmission = {
  numericPercentage: 82,
  letterGrade: 'B',
  overallScore: 82,
  score: '82% (B)',
  overallComment: 'Ana, this is exactly the kind of answer that helps me teach.',
  rubricScores: { understanding: { score: 82, comment: '' } },
  rubricConfig: { minScore: 0, maxScore: 100 },
  document: { assignment: { submitForGrade: false, pointValue: null } },
};

describe('ViewPanel on work that is not for a grade', () => {
  it('still shows the feedback and the rubric it was assessed on', () => {
    // Feedback-only does not mean unassessed. The response was read and
    // scored; only the grade is withheld. Hiding the feedback as well left
    // an exit ticket looking as though nothing had happened to it.
    render(<ViewPanel submission={feedbackOnlySubmission} />);

    expect(text()).toContain('Overall Feedback');
    expect(text()).toContain('exactly the kind of answer that helps me teach');
    expect(text()).toContain('Rubric');
    expect(text()).toContain('Understanding');
    expect(text()).toContain('82/100');
  });

  it('withholds the overall grade, which is the whole point of the choice', () => {
    render(<ViewPanel submission={feedbackOnlySubmission} />);

    expect(text()).not.toContain('Overall Grade');
    expect(text()).not.toContain('82% (B)');
  });

  it('shows the grade when the work is submitted for one', () => {
    render(
      <ViewPanel
        submission={{
          ...feedbackOnlySubmission,
          numericPercentage: 92,
          letterGrade: 'A',
          overallScore: 92,
          score: '92% (A)',
          rubricScores: { understanding: { score: 92, comment: '' } },
          document: {
            assignment: { submitForGrade: true, pointValue: 10 },
          },
        }}
      />
    );

    expect(text()).toContain('Overall Grade');
    // Band-scored, so the percentage formats against the teacher's points.
    expect(text()).toContain('9 / 10');
    expect(text()).toContain('Overall Feedback');
  });

  it('still reports nothing when nothing has been assessed', () => {
    render(
      <ViewPanel
        submission={{
          numericPercentage: null,
          letterGrade: null,
          overallScore: null,
          score: null,
          overallComment: null,
          rubricScores: {},
          rubricConfig: { minScore: 0, maxScore: 100 },
          document: { assignment: { submitForGrade: false, pointValue: null } },
        }}
      />
    );

    expect(text()).not.toContain('Overall Feedback');
    expect(text()).not.toContain('Rubric');
  });
});
