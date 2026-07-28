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

// The class-summary panel embedded in this sheet uses useFetcher for
// generation and Link for its student-example drill-in — both need a data
// router context. Mirrors class-insights-panel.test.tsx.
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
  assignmentType: { title: 'DBQ' },
  documentCount: 12,
  gradedCount: 5,
  insight: null,
};

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
  it('shows minimal identifying information about the assignment', () => {
    const el = render(
      <AssignmentSummarySheetContent
        renderSheet={false}
        assignment={ASSIGNMENT}
        classInsightsEnabled={false}
        onViewDocuments={() => {}}
      />
    );
    expect(el.textContent).toContain('The Gilded Age DBQ');
    expect(el.textContent).toContain('DBQ');
    expect(el.textContent).toMatch(/12\s+documents/);
    expect(el.textContent).toMatch(/5 graded/);
  });

  it('routes the Docs pill through onViewDocuments so the caller can close the sheet and navigate', () => {
    const onViewDocuments = mock();
    const el = render(
      <AssignmentSummarySheetContent
        renderSheet={false}
        assignment={ASSIGNMENT}
        classInsightsEnabled={false}
        onViewDocuments={onViewDocuments}
      />
    );
    const pill = Array.from(el.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Docs')
    )!;
    expect(pill).toBeDefined();
    act(() => {
      pill.dispatchEvent(new Event('click', { bubbles: true }));
    });
    expect(onViewDocuments).toHaveBeenCalledTimes(1);
  });

  it('hides the class-summary panel when classInsightsEnabled is off', () => {
    const el = render(
      <AssignmentSummarySheetContent
        renderSheet={false}
        assignment={ASSIGNMENT}
        classInsightsEnabled={false}
        onViewDocuments={() => {}}
      />
    );
    expect(el.textContent).not.toContain('Class performance summary');
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
    expect(el.querySelector('button')).toBeNull();
  });
});
