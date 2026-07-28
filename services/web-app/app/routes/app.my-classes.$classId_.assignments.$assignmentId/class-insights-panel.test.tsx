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

import type { ClassInsight } from './class-insights-panel';

const { ClassInsightsPanel } = await import('./class-insights-panel');

const READY_INSIGHT: ClassInsight = {
  status: 'ready' as const,
  submissionCount: 24,
  generatedAt: '2026-07-08T00:00:00.000Z',
  summary: {
    overview: 'The class writes strong theses but struggles to analyze evidence.',
    categories: [
      {
        key: 'thesis_and_content',
        label: 'Thesis/Content',
        status: 'strength',
        summary: 'Nearly every student opened with a clear, arguable claim.',
      },
      {
        key: 'evidence_and_support',
        label: 'Evidence/Support',
        status: 'gap',
        summary: 'Most quotes are dropped in without analysis.',
      },
    ],
    nextSteps: [
      {
        title: 'Model quote analysis',
        detail: 'Do a whole-class think-aloud unpacking one quotation.',
        rubricCategory: 'evidence_and_support',
      },
    ],
  },
};

const INSIGHT_WITH_DIFFERENTIATION: ClassInsight = {
  ...READY_INSIGHT,
  summary: {
    ...READY_INSIGHT.summary!,
    differentiation: {
      focusGroups: [
        {
          category: 'evidence_and_support',
          label: 'Evidence/Support',
          students: [
            { name: 'Ben Ortiz', href: '/app/submissions/sub-ben' },
            { name: 'Ana Reyes', href: '/app/submissions/sub-ana' },
          ],
        },
      ],
      individuals: [
        {
          kind: 'support' as const,
          student: { name: 'Ben Ortiz', href: '/app/submissions/sub-ben' },
          categoryLabels: ['Thesis/Content', 'Evidence/Support'],
        },
        {
          kind: 'extension' as const,
          student: { name: 'Dara Lin', href: null },
          categoryLabels: ['Thesis/Content', 'Evidence/Support'],
        },
      ],
    },
  },
};

let root: Root | null = null;
let container: HTMLDivElement | null = null;

// Links inside the panel need a router context.
const { MemoryRouter } = actualReactRouter;

function render(element: ReactElement) {
  container = document.createElement('div');
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
  container?.remove();
  root = null;
  container = null;
});

describe('ClassInsightsPanel', () => {
  it('shows the generate action when there is no cached insight', () => {
    const el = render(
      <ClassInsightsPanel classAssignmentId="ca-1" initialInsight={null} />
    );
    expect(el.textContent).toMatch(/summarize class performance/i);
    expect(el.textContent).not.toContain('strong theses');
  });

  it('submits to the insights endpoint when generating', () => {
    const el = render(
      <ClassInsightsPanel classAssignmentId="ca-1" initialInsight={null} />
    );
    const button = el.querySelector('button')!;
    act(() => {
      button.dispatchEvent(new Event('click', { bubbles: true }));
    });
    expect(submit).toHaveBeenCalledTimes(1);
    const [payload, options] = submit.mock.calls[0];
    expect(payload).toEqual({ classAssignmentId: 'ca-1' });
    expect(options).toMatchObject({
      method: 'post',
      action: '/api/domain/assignment-insights',
    });
  });

  it('renders overview, category calls, and next steps from a cached insight', () => {
    const el = render(
      <ClassInsightsPanel
        classAssignmentId="ca-1"
        initialInsight={READY_INSIGHT}
      />
    );
    expect(el.textContent).toContain('strong theses');
    expect(el.textContent).toContain('Evidence/Support');
    expect(el.textContent).toContain('Model quote analysis');
    expect(el.textContent).toMatch(/24 submissions/i);
    // regenerate affordance is available once an insight exists
    expect(el.textContent).toMatch(/regenerate|update/i);

    const examplesLabel = Array.from(el.querySelectorAll('span')).find((span) =>
      span.textContent?.includes('Show student examples')
    );
    expect(examplesLabel?.className).toContain('text-primary');
    expect(examplesLabel?.className).not.toContain('text-primary/80');
  });

  it('renders differentiation groups and individual flags when present', () => {
    const el = render(
      <ClassInsightsPanel
        classAssignmentId="ca-1"
        initialInsight={INSIGHT_WITH_DIFFERENTIATION}
      />
    );
    expect(el.textContent).toMatch(/differentiation starting points/i);
    expect(el.textContent).toMatch(/small group · evidence\/support/i);
    expect(el.textContent).toMatch(/2 students scored 2 or below/i);
    expect(el.textContent).toContain('Ana Reyes');
    expect(el.textContent).toMatch(/check in/i);
    expect(el.textContent).toMatch(/ready for more/i);
    // Students with a submission link out to the full paper.
    const link = Array.from(el.querySelectorAll('a')).find((a) =>
      a.textContent?.includes('Ben Ortiz')
    );
    expect(link?.getAttribute('href')).toBe('/app/submissions/sub-ben');
  });

  it('omits the differentiation section when the summary has none', () => {
    const el = render(
      <ClassInsightsPanel
        classAssignmentId="ca-1"
        initialInsight={READY_INSIGHT}
      />
    );
    expect(el.textContent).not.toMatch(/differentiation starting points/i);
  });

  it('renders a fresh insight returned by the fetcher', () => {
    fetcher.data = { success: true, insight: READY_INSIGHT };
    const el = render(
      <ClassInsightsPanel classAssignmentId="ca-1" initialInsight={null} />
    );
    expect(el.textContent).toContain('strong theses');
  });

  it('surfaces a friendly error when generation fails', () => {
    fetcher.data = {
      success: false,
      message: 'No graded submissions yet.',
    };
    const el = render(
      <ClassInsightsPanel classAssignmentId="ca-1" initialInsight={null} />
    );
    expect(el.textContent).toContain('No graded submissions yet.');
  });

  it('shows a working state while the fetcher is submitting', () => {
    fetcher.state = 'submitting';
    const el = render(
      <ClassInsightsPanel classAssignmentId="ca-1" initialInsight={null} />
    );
    const button = el.querySelector('button')!;
    expect(button.hasAttribute('disabled')).toBe(true);
  });

  it('uses container-aware layouts so the embedded sheet stays single-column', () => {
    const el = render(
      <ClassInsightsPanel
        classAssignmentId="ca-1"
        initialInsight={READY_INSIGHT}
      />
    );

    const panel = el.querySelector('section')!;
    const header = panel.firstElementChild as HTMLElement;
    const categories = Array.from(panel.querySelectorAll('ul')).find((list) =>
      list.textContent?.includes('Thesis/Content')
    )!;

    expect(panel.className).toContain('@container');
    expect(header.className).toContain('flex-col');
    expect(header.className).toContain('@xl:flex-row');
    expect(categories.className).toContain('@xl:grid-cols-2');
    expect(categories.className).not.toContain('sm:grid-cols-2');
  });

  it('allows long generated text to wrap without forcing horizontal scroll', () => {
    const el = render(
      <ClassInsightsPanel
        classAssignmentId="ca-1"
        initialInsight={READY_INSIGHT}
      />
    );

    const generatedCopy = Array.from(el.querySelectorAll('p')).filter((node) =>
      node.textContent?.match(/strong theses|Nearly every student|think-aloud/)
    );

    expect(generatedCopy).not.toHaveLength(0);
    for (const node of generatedCopy) {
      expect(node.className).toContain('[overflow-wrap:anywhere]');
    }
  });

  it('lazy-loads student examples when a category box is expanded', () => {
    const el = render(
      <ClassInsightsPanel
        classAssignmentId="ca-1"
        initialInsight={READY_INSIGHT}
      />
    );
    const categoryButton = Array.from(el.querySelectorAll('button')).find(
      (button) => button.textContent?.includes('Evidence/Support')
    )!;
    expect(categoryButton).toBeTruthy();
    expect(categoryButton.getAttribute('aria-expanded')).toBe('false');

    act(() => {
      categoryButton.dispatchEvent(new Event('click', { bubbles: true }));
    });

    expect(load).toHaveBeenCalledTimes(1);
    const url = load.mock.calls[0][0] as string;
    expect(url).toContain('/api/domain/assignment-insights/examples');
    expect(url).toContain('classAssignmentId=ca-1');
    expect(url).toContain('category=evidence_and_support');
    expect(url).toContain('status=gap');
    expect(categoryButton.getAttribute('aria-expanded')).toBe('true');
  });
});
