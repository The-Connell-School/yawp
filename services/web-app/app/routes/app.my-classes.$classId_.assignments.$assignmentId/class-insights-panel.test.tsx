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
const fetcher: { state: string; data: unknown; submit: typeof submit } = {
  state: 'idle',
  data: null,
  submit,
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

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function render(element: ReactElement) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(element);
  });
  return container;
}

beforeEach(() => {
  submit.mockReset();
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
});
