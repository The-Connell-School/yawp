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

import type { ViewPanelSubmission } from './view-panel';

const { ViewPanel } = await import('./view-panel');
const { EXIT_TICKET_SCORE_BANDS } = await import(
  '~/domain/assignment-types/exit-ticket-rubric'
);

let root: Root | null = null;

function render(element: ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(element);
  });
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
  rubricConfig: {
    minScore: 0,
    maxScore: 100,
    categories: [
      {
        key: 'understanding',
        label: 'Understanding',
        bands: EXIT_TICKET_SCORE_BANDS,
      },
    ],
  },
  document: { assignment: { submitForGrade: false, pointValue: null } },
};

describe('ViewPanel on work that is not for a grade', () => {
  it('withholds assessment from students until the teacher releases it', () => {
    render(
      <ViewPanel submission={feedbackOnlySubmission} viewer="student" />
    );

    expect(document.body.textContent).toContain('Not yet graded');
    expect(text()).not.toContain('Overall Feedback');
    expect(text()).not.toContain('Explains it');
  });

  it('still shows the feedback and the rubric it was assessed on', () => {
    // Feedback-only does not mean unassessed. The response was read and
    // scored; only the grade is withheld. Hiding the feedback as well left
    // an exit ticket looking as though nothing had happened to it.
    render(<ViewPanel submission={feedbackOnlySubmission} />);

    expect(text()).toContain('Overall Feedback');
    expect(text()).toContain('exactly the kind of answer that helps me teach');
    expect(text()).toContain('Rubric');
    expect(text()).toContain('Understanding');
    // The band, never the score: 82 is the number the teacher withheld.
    expect(text()).toContain('Explains it');
    expect(text()).not.toContain('82/100');
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

    expect(document.body.textContent).toContain('Not yet graded');
    expect(text()).not.toContain('Overall Feedback');
    expect(text()).not.toContain('Rubric');
  });

  it('hides a rubric row that was never scored', () => {
    render(
      <ViewPanel
        submission={{
          ...gradedDailyPages,
          rubricScores: {
            engagement: { score: 2, comment: '' },
            reflection: { score: null, comment: '' },
          },
        }}
      />
    );

    expect(text()).not.toContain('Reflection');
  });

  it('shows legacy percentage grades as points out of 100', () => {
    render(
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
    );

    expect(text()).toContain('84 / 100');
    expect(text()).not.toContain('%');
    expect(text()).toContain('4/5');
  });
});

/** An exit ticket as it really arrives: one banded category, no category comment. */
const bandedExitTicket: ViewPanelSubmission = {
  numericPercentage: 79,
  letterGrade: 'C',
  overallScore: 79,
  score: '79% (C)',
  overallComment: 'Riley, that last sentence is a genuinely sharp idea.',
  rubricScores: { understanding: { score: 79, comment: '' } },
  rubricConfig: {
    minScore: 0,
    maxScore: 100,
    categories: [
      {
        key: 'understanding',
        label: 'Understanding',
        bands: EXIT_TICKET_SCORE_BANDS,
      },
    ],
  },
  document: { assignment: { submitForGrade: true, pointValue: 15 } },
};

describe('ViewPanel where the rubric scores one banded category', () => {
  it('names the band the score landed in, beside the grade', () => {
    // The band is the grader's actual judgement -- it picks the band from its
    // description and only then a number inside it. Showing the number alone
    // showed the refinement and threw away the decision.
    render(<ViewPanel submission={bandedExitTicket} />);

    expect(text()).toContain('12 / 15');
    expect(text()).toContain('Partly there');
  });

  it('says what that band means', () => {
    render(<ViewPanel submission={bandedExitTicket} />);

    expect(text()).toContain('The right idea in their own words');
  });

  it('drops the rubric section, which could only restate the grade', () => {
    // One category at weight 1 means the category score IS the overall score,
    // and with no category comment the row expanded to "No feedback for this
    // category". A second copy of the grade behind an empty disclosure.
    render(<ViewPanel submission={bandedExitTicket} />);

    expect(text()).not.toContain('Rubric');
    expect(text()).not.toContain('No feedback for this category');
    expect(text()).not.toContain('79/100');
  });

  it('keeps the rubric section when the category carries its own feedback', () => {
    render(
      <ViewPanel
        submission={{
          ...bandedExitTicket,
          rubricScores: {
            understanding: { score: 79, comment: 'Cite the line next time.' },
          },
        }}
      />
    );

    // The comment itself sits inside a collapsed row; what matters here is
    // that the section survives, because it now has something to disclose.
    expect(text()).toContain('Rubric');
    expect(text()).toContain('Understanding');
  });

  it('keeps the rubric section when there is more than one category', () => {
    render(
      <ViewPanel
        submission={{
          ...bandedExitTicket,
          rubricScores: {
            thesis_and_content: { score: 4, comment: '' },
            organization: { score: 3, comment: '' },
          },
          rubricConfig: { minScore: 1, maxScore: 5 },
        }}
      />
    );

    expect(text()).toContain('Rubric');
    expect(text()).toContain('Thesis And Content');
  });

  it('shows no band when the rubric declares none', () => {
    // An essay rubric has no bands. Nothing to name, so nothing is added.
    render(
      <ViewPanel
        submission={{
          ...bandedExitTicket,
          rubricConfig: { minScore: 0, maxScore: 100 },
        }}
      />
    );

    expect(text()).not.toContain('Partly there');
    expect(text()).toContain('12 / 15');
  });
});

describe('ViewPanel where the grade is withheld', () => {
  const withheld = {
    ...bandedExitTicket,
    document: { assignment: { submitForGrade: false, pointValue: null } },
  };

  it('names the band in the rubric row instead of the score', () => {
    render(<ViewPanel submission={withheld} />);

    expect(text()).toContain('Rubric');
    expect(text()).toContain('Understanding');
    expect(text()).toContain('Partly there');
    expect(text()).not.toContain('79/100');
    expect(text()).not.toContain('Overall Grade');
  });

  it('opens that row on what the band means', () => {
    // The whole complaint about the old row was a chevron onto nothing. This
    // one has something to say, so it starts said.
    render(<ViewPanel submission={withheld} />);

    expect(text()).toContain('The right idea in their own words');
  });

  it('never prints the score for a rubric with no bands', () => {
    // The leak this replaces: no band to name, so the row fell back to the
    // raw score -- the exact number feedback-only exists to withhold.
    render(
      <ViewPanel
        submission={{
          ...withheld,
          rubricConfig: { minScore: 0, maxScore: 100 },
          rubricScores: {
            understanding: { score: 79, comment: 'Cite the line next time.' },
          },
        }}
      />
    );

    expect(text()).not.toContain('79/100');
    expect(text()).toContain('Understanding');
  });

  it('drops a row with nothing left to say', () => {
    // No band, no comment, and the score withheld: an empty row under an
    // empty heading.
    render(
      <ViewPanel
        submission={{
          ...withheld,
          rubricConfig: { minScore: 0, maxScore: 100 },
        }}
      />
    );

    expect(text()).not.toContain('Rubric');
    expect(text()).toContain('Overall Feedback');
  });

  it('still shows the score when the work is for a grade', () => {
    // The withholding is what removes the number, not the band feature.
    render(
      <ViewPanel
        submission={{
          ...bandedExitTicket,
          rubricScores: {
            thesis_and_content: { score: 4, comment: '' },
            organization: { score: 3, comment: '' },
          },
          rubricConfig: { minScore: 1, maxScore: 5 },
        }}
      />
    );

    expect(text()).toContain('4/5');
  });
});
