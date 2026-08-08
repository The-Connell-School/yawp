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
// A single fetcher stub shared by every useFetcher() call in the tree — here
// that is the real ClassInsightsPanel, rendered unmocked.
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

const ASSIGNMENT = {
  id: 'assignment-1',
  classAssignmentId: 'class-assignment-1',
  title: 'The Gilded Age DBQ',
  prompt: 'Analyze the effects of industrialization.',
  promptAttachmentName: null,
  submitForGrade: true,
  pointValue: 100,
  assignmentTypeId: 'type-1',
  assignmentType: { id: 'type-1', title: 'DBQ', systemKey: null },
  otherClassCount: 1,
  _count: { documents: 12 },
  insight: null,
};

// Mutated per test so one module-level useRouteLoaderData mock can serve both
// the flag-on and flag-off pages.
let parentData: any = null;
let searchParams = new URLSearchParams();
let routeParams: { classId?: string; assignmentId?: string } = {};

const actualReactRouter = await import('react-router');
mock.module('react-router', () => ({
  ...actualReactRouter,
  Link: ({ children, to, ...props }: any) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
  useFetcher: () => fetcher,
  useParams: () => routeParams,
  useSearchParams: () => [searchParams, mock()],
  useRouteLoaderData: () => parentData,
}));

const { MemoryRouter } = actualReactRouter;
const { default: ClassSummaryRoute } = await import('./route');

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
  routeParams = { classId: 'class-1', assignmentId: 'assignment-1' };
  searchParams = new URLSearchParams('tab=documents&assignmentId=assignment-1');
  parentData = {
    klass: { id: 'class-1', grade: '9', period: '2', title: 'History' },
    classInsightsEnabled: true,
    submissions: [] as any[],
    assignments: [ASSIGNMENT],
  };
});

afterEach(() => {
  if (root) act(() => root!.unmount());
  document.body.innerHTML = '';
  root = null;
});

describe('ClassSummaryRoute', () => {
  it('renders the class summary as a full page with the insights panel', () => {
    const el = render(<ClassSummaryRoute />);

    expect(el.querySelector('[data-testid="class-summary-page"]')).toBeTruthy();
    // No sheet/dialog wrapper — this is embedded page content.
    expect(el.querySelector('[role="dialog"]')).toBeFalsy();
    expect(
      el.querySelector('[data-testid="class-summary-page-title"]')?.textContent
    ).toBe('The Gilded Age DBQ');
    expect(el.textContent).toContain('Class performance summary');
    expect(
      el.querySelector('[data-testid="class-summary-insights-disabled"]')
    ).toBeFalsy();
  });

  it('a Back to documents link carries the search params it arrived with', () => {
    const el = render(<ClassSummaryRoute />);
    const backLink = Array.from(el.querySelectorAll('a')).find((a) =>
      a.textContent?.includes('Back to documents')
    )!;
    expect(backLink.getAttribute('href')).toBe(
      '/app/my-classes/class-1?tab=documents&assignmentId=assignment-1'
    );
  });

  it('falls back to the documents tab when there are no search params', () => {
    searchParams = new URLSearchParams();
    const el = render(<ClassSummaryRoute />);
    const backLink = Array.from(el.querySelectorAll('a')).find((a) =>
      a.textContent?.includes('Back to documents')
    )!;
    expect(backLink.getAttribute('href')).toBe(
      '/app/my-classes/class-1?tab=documents'
    );
  });

  it('explains why the page is empty when class insights are off for the org', () => {
    parentData.classInsightsEnabled = false;
    const el = render(<ClassSummaryRoute />);

    const page = el.querySelector('[data-testid="class-summary-page"]')!;
    expect(page).toBeTruthy();
    // The title still renders, but the body is never a bare heading.
    expect(
      el.querySelector('[data-testid="class-summary-page-title"]')?.textContent
    ).toBe('The Gilded Age DBQ');
    const notice = el.querySelector(
      '[data-testid="class-summary-insights-disabled"]'
    );
    expect(notice).toBeTruthy();
    expect(notice?.textContent).toContain('not turned on');
    // The teacher still has a way back out.
    expect(el.textContent).toContain('Back to documents');
  });

  it('renders a not-found state when the assignment is not on this class', () => {
    routeParams = { classId: 'class-1', assignmentId: 'assignment-missing' };
    const el = render(<ClassSummaryRoute />);

    expect(el.textContent).toContain('Assignment not found.');
    expect(el.textContent).toContain('Back to documents');
  });
});
