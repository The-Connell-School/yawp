import { GlobalRegistrator } from '@happy-dom/global-registrator';

try {
  GlobalRegistrator.register();
} catch {
  // Multiple Bun test files can share the same process.
}

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

const submit = mock();
const load = mock();
const fetcher: {
  state: string;
  data: unknown;
  submit: typeof submit;
  load: typeof load;
} = {
  state: 'idle',
  data: null,
  submit,
  load,
};

const actualReactRouter = await import('react-router');
mock.module('react-router', () => ({
  ...actualReactRouter,
  useFetcher: () => fetcher,
}));

const { MemoryRouter } = actualReactRouter;

const {
  ASSIGNMENT_SUMMARY_SHEET_CONTENT_CLASS_NAME,
  AssignmentSummarySheetContent,
}: typeof import('./assignment-summary-sheet') = await import(
  './assignment-summary-sheet'
);
type AssignmentSummarySheetAssignment =
  import('./assignment-summary-sheet').AssignmentSummarySheetAssignment;

const ASSIGNMENT: AssignmentSummarySheetAssignment = {
  id: 'assignment-1',
  classAssignmentId: 'class-assignment-1',
  title: 'The Gilded Age DBQ',
  prompt: 'Analyze the effects of industrialization on American society.',
  promptAttachmentName: null,
  submitForGrade: true,
  pointValue: 100,
  assignmentType: { title: 'DBQ' },
  documentCount: 12,
  gradedCount: 5,
  insight: null,
};

const LONG_PROMPT = `${'A'.repeat(220)} industrialization.`;

let root: Root | null = null;

function render(element: ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(<MemoryRouter>{element}</MemoryRouter>);
  });
  return container;
}

beforeEach(() => {
  submit.mockReset();
  load.mockReset();
  fetcher.state = 'idle';
  fetcher.data = null;
});

afterEach(() => {
  if (root) act(() => root!.unmount());
  document.body.innerHTML = '';
  root = null;
});

describe('AssignmentSummarySheetContent', () => {
  it('uses a flex column layout so sheet footers can stay pinned', () => {
    expect(ASSIGNMENT_SUMMARY_SHEET_CONTENT_CLASS_NAME).toContain('flex-col');
    expect(ASSIGNMENT_SUMMARY_SHEET_CONTENT_CLASS_NAME).toContain(
      'overflow-hidden'
    );
    expect(ASSIGNMENT_SUMMARY_SHEET_CONTENT_CLASS_NAME).toContain(
      'dark:bg-card'
    );
    expect(ASSIGNMENT_SUMMARY_SHEET_CONTENT_CLASS_NAME).toContain(
      'text-foreground'
    );
  });

  it('shows metadata for type, documents, grading, and prompt', () => {
    const el = render(
      <AssignmentSummarySheetContent
        renderSheet={false}
        assignment={ASSIGNMENT}
        classInsightsEnabled={false}
        onViewDocuments={() => {}}
      />
    );
    expect(el.textContent).toContain('The Gilded Age DBQ');
    expect(
      el.querySelector('[data-testid="assignment-metadata-section"]')?.className
    ).toContain('rounded-xl');
    expect(
      el.querySelector('[data-testid="assignment-metadata-section"] dl')?.className
    ).toContain('divide-y');
    expect(el.textContent).toContain('Type');
    expect(el.textContent).toContain('DBQ');
    expect(el.textContent).toMatch(/12\s+docs/);
    expect(el.textContent).toContain('Submit for grade');
    expect(el.textContent).toContain('Point value');
    expect(el.textContent).toContain('View only');
    expect(el.textContent).toContain('Prompt');
    expect(el.textContent).toContain('Analyze the effects of industrialization');
    expect(el.textContent).not.toMatch(/5 graded/);
    expect(el.textContent).not.toContain('Docs');
  });

  it('shows the attached PDF beside the text prompt', () => {
    const el = render(
      <AssignmentSummarySheetContent
        renderSheet={false}
        assignment={{
          ...ASSIGNMENT,
          promptAttachmentName: 'Essay directions.pdf',
        }}
        classInsightsEnabled={false}
        onViewDocuments={() => {}}
      />
    );

    expect(el.textContent).toContain('Essay directions.pdf');
  });

  it('shows view-only assignments without a point value row', () => {
    const el = render(
      <AssignmentSummarySheetContent
        renderSheet={false}
        assignment={{
          ...ASSIGNMENT,
          submitForGrade: false,
          pointValue: null,
        }}
        classInsightsEnabled={false}
        onViewDocuments={() => {}}
      />
    );
    expect(el.textContent).toContain('Submit for grade');
    expect(el.textContent).not.toContain('Point value');
    expect(el.textContent).toMatch(/View only[\s\S]*Yes/);
  });

  it('routes the combined documents link through onViewDocuments', () => {
    const onViewDocuments = mock();
    const el = render(
      <AssignmentSummarySheetContent
        renderSheet={false}
        assignment={ASSIGNMENT}
        classInsightsEnabled={false}
        onViewDocuments={onViewDocuments}
      />
    );
    const link = el.querySelector(
      '[data-testid="assignment-documents-link"]'
    ) as HTMLButtonElement;
    expect(link).toBeTruthy();
    act(() => {
      link.dispatchEvent(new Event('click', { bubbles: true }));
    });
    expect(onViewDocuments).toHaveBeenCalledTimes(1);
  });

  it('offers expand/collapse for long prompts', () => {
    const el = render(
      <AssignmentSummarySheetContent
        renderSheet={false}
        assignment={{ ...ASSIGNMENT, prompt: LONG_PROMPT }}
        classInsightsEnabled={false}
        onViewDocuments={() => {}}
      />
    );
    const toggle = el.querySelector(
      '[data-testid="assignment-prompt-toggle"]'
    ) as HTMLButtonElement;
    expect(toggle).toBeTruthy();
    expect(toggle.textContent).toContain('Show full prompt');
    act(() => toggle.click());
    expect(toggle.textContent).toContain('Show less');
  });

  it('hides the class performance section when insights are disabled', () => {
    const el = render(
      <AssignmentSummarySheetContent
        renderSheet={false}
        assignment={ASSIGNMENT}
        classInsightsEnabled={false}
        onViewDocuments={() => {}}
      />
    );
    expect(el.querySelector('[data-testid="class-summary-placeholder"]')).toBeFalsy();
    expect(
      el.querySelector('[data-testid="class-insight-generate-button"]')
    ).toBeFalsy();
    expect(el.textContent).not.toContain('Class performance summary');
    expect(el.textContent).not.toMatch(/aren't enabled for your organization/i);
  });

  it('explains when nothing has been graded yet', () => {
    const el = render(
      <AssignmentSummarySheetContent
        renderSheet={false}
        assignment={{ ...ASSIGNMENT, gradedCount: 0 }}
        classInsightsEnabled={true}
        onViewDocuments={() => {}}
      />
    );
    expect(
      el.querySelector('[data-testid="class-insight-generate-button"]')
    ).toBeFalsy();
    expect(el.textContent).toMatch(
      /grade a few submissions first, then generate class insights/i
    );
  });

  it('shows the class-summary generation entry point when classInsightsEnabled is on', () => {
    const el = render(
      <AssignmentSummarySheetContent
        renderSheet={false}
        assignment={ASSIGNMENT}
        classInsightsEnabled={true}
        onViewDocuments={() => {}}
      />
    );
    expect(el.querySelector('[data-testid="class-summary-placeholder"]')).toBeFalsy();
    expect(el.textContent).toContain('Class performance summary');
    expect(el.textContent).toMatch(/summarize class performance/i);
  });

  it('renders nothing assignment-specific when no assignment is selected', () => {
    const el = render(
      <AssignmentSummarySheetContent
        renderSheet={false}
        assignment={null}
        classInsightsEnabled={true}
        onViewDocuments={() => {}}
      />
    );
    expect(el.querySelector('[data-testid="assignment-metadata-section"]')).toBeFalsy();
  });
});
