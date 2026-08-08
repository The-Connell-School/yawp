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

function sectionFixture(
  classId: string,
  label: string,
  submissionCount: number | null
) {
  return {
    classId,
    classAssignmentId: `ca-${classId}`,
    label,
    gradedCount: submissionCount ?? 0,
    insight:
      submissionCount === null
        ? null
        : {
            status: 'ready' as const,
            submissionCount,
            generatedAt: '2026-08-01T00:00:00.000Z',
            summary: {
              overview: `Overview for ${label}.`,
              categories: [
                {
                  key: 'thesis',
                  label: 'Thesis',
                  status: 'strength' as const,
                  summary: 'Clear claims.',
                },
              ],
              nextSteps: [],
            },
          },
  };
}

// Mutated per test so one module-level useRouteLoaderData mock can serve both
// the flag-on and flag-off pages.
let parentData: any = null;
let loaderData: any = { sections: [] };
let searchParams = new URLSearchParams();
let routeParams: { classId?: string; assignmentId?: string } = {};

const actualReactRouter = await import('react-router');
mock.module('react-router', () => ({
  ...actualReactRouter,
  // `replace` is a router-only prop; passing it through would land on the DOM.
  Link: ({ children, to, replace: _replace, ...props }: any) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
  useFetcher: () => fetcher,
  useParams: () => routeParams,
  useSearchParams: () => [searchParams, mock()],
  useLoaderData: () => loaderData,
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
  loaderData = { sections: [] };
  parentData = {
    role: 'TEACHER',
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

  it('offers no scope toggle when the assignment runs in one class only', () => {
    loaderData = { sections: [sectionFixture('class-1', 'Period 1', 20)] };
    const el = render(<ClassSummaryRoute />);

    expect(
      el.querySelector('[data-testid="class-summary-scope-toggle"]')
    ).toBeFalsy();
    expect(
      el.querySelector('[data-testid="across-sections-panel"]')
    ).toBeFalsy();
  });

  it('defaults to this class and offers the other sections as opt-in', () => {
    loaderData = {
      sections: [
        sectionFixture('class-1', 'Period 1', 20),
        sectionFixture('class-2', 'Period 2', 18),
      ],
    };
    const el = render(<ClassSummaryRoute />);

    // Single class is what renders without asking for anything else.
    expect(
      el.querySelector('[data-testid="across-sections-panel"]')
    ).toBeFalsy();
    expect(el.textContent).toContain('Class performance summary');

    const toggle = el.querySelector(
      '[data-testid="class-summary-scope-toggle"]'
    )!;
    expect(toggle).toBeTruthy();
    const thisClass = toggle.querySelector(
      '[data-testid="class-summary-scope-this-class"]'
    )!;
    const allSections = toggle.querySelector(
      '[data-testid="class-summary-scope-all-sections"]'
    )!;
    expect(thisClass.getAttribute('aria-current')).toBe('true');
    expect(allSections.getAttribute('aria-current')).toBeNull();
    expect(allSections.textContent).toContain('All 2 sections');
    // Opting in keeps the params the teacher arrived with.
    expect(allSections.getAttribute('href')).toBe(
      '/app/my-classes/class-1/summary/assignment-1?tab=documents&assignmentId=assignment-1&sections=all'
    );
  });

  it('renders the across-sections view when opted in, and offers the way back', () => {
    searchParams = new URLSearchParams('tab=documents&sections=all');
    loaderData = {
      sections: [
        sectionFixture('class-1', 'Period 1', 20),
        sectionFixture('class-2', 'Period 2', 18),
      ],
    };
    const el = render(<ClassSummaryRoute />);

    expect(
      el.querySelector('[data-testid="across-sections-panel"]')
    ).toBeTruthy();
    expect(
      el.querySelector('[data-testid="across-sections-subtitle"]')?.textContent
    ).toContain('2 of 2 sections summarized');
    expect(el.textContent).toContain('38 submissions in total');

    const thisClass = el.querySelector(
      '[data-testid="class-summary-scope-this-class"]'
    )!;
    expect(thisClass.getAttribute('href')).toBe(
      '/app/my-classes/class-1/summary/assignment-1?tab=documents'
    );
  });

  it('shows a thin section rather than folding it into a single number', () => {
    searchParams = new URLSearchParams('sections=all');
    loaderData = {
      sections: [
        sectionFixture('class-1', 'Period 1', 24),
        sectionFixture('class-2', 'Period 2', 3),
      ],
    };
    const el = render(<ClassSummaryRoute />);

    const warning = el.querySelector(
      '[data-testid="across-sections-coverage-warning"]'
    );
    expect(warning?.textContent).toContain('Period 2');
    expect(
      el.querySelectorAll('[data-testid="section-thin-badge"]')
    ).toHaveLength(1);
    // Both sections' own counts are on the page.
    const cards = el.querySelectorAll(
      '[data-testid="across-sections-coverage-card"]'
    );
    expect(cards).toHaveLength(2);
    expect(cards[0].textContent).toContain('24');
    expect(cards[1].textContent).toContain('3');
  });

  it('names a section with no summary instead of quietly omitting it', () => {
    searchParams = new URLSearchParams('sections=all');
    loaderData = {
      sections: [
        sectionFixture('class-1', 'Period 1', 20),
        sectionFixture('class-2', 'Period 2', null),
      ],
    };
    const el = render(<ClassSummaryRoute />);

    const warning = el.querySelector(
      '[data-testid="across-sections-coverage-warning"]'
    );
    expect(warning?.textContent).toContain('Period 2');
    expect(warning?.textContent).toContain('no summary yet');
    expect(
      el.querySelector('[data-testid="across-sections-subtitle"]')?.textContent
    ).toContain('1 of 2 sections summarized');
  });

  it('renders a not-found state when the assignment is not on this class', () => {
    routeParams = { classId: 'class-1', assignmentId: 'assignment-missing' };
    const el = render(<ClassSummaryRoute />);

    expect(el.textContent).toContain('Assignment not found.');
    expect(el.textContent).toContain('Back to documents');
  });
});
