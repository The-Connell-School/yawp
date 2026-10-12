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

const load = mock();
const fetcher: { state: string; data: unknown; load: typeof load } = {
  state: 'idle',
  data: null,
  load,
};

const actualReactRouter = await import('react-router');
mock.module('react-router', () => ({
  ...actualReactRouter,
  useFetcher: () => fetcher,
}));

const { ClassModelsSection } = await import('./class-models-section');
const { MemoryRouter } = actualReactRouter;

const MODELS = {
  focuses: [
    {
      category: 'evidence_and_support',
      label: 'Evidence/Support',
      exemplar: {
        submissionId: 'sub-ava',
        studentName: 'Ava Ruiz',
        href: '/app/submissions/sub-ava',
        snippet: 'The quote shows that hope is a choice, not a mood.',
        score: 5,
        maxScore: 5,
      },
      instructive: {
        submissionId: 'sub-ben',
        studentName: 'Ben Ito',
        href: '/app/submissions/sub-ben',
        snippet: 'The author uses a quote. This proves my point.',
        score: 1,
        maxScore: 5,
      },
      exemplarPrompts: ['What exactly makes the evidence/support work here?'],
      instructivePrompts: [
        'What is the one revision that would most improve the evidence/support?',
        'Remove the student’s name before sharing, or ask them first.',
      ],
    },
  ],
};

let root: Root | null = null;
let container: HTMLDivElement | null = null;

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

describe('ClassModelsSection', () => {
  it('invites the teacher to look for models before loading anything', () => {
    const el = render(<ClassModelsSection classAssignmentId="ca-1" />);
    expect(el.textContent).toMatch(/models to teach from/i);
    expect(load).not.toHaveBeenCalled();
  });

  it('loads the models for this class assignment on request', () => {
    const el = render(<ClassModelsSection classAssignmentId="ca-1" />);
    const button = [...el.querySelectorAll('button')].find((b) =>
      /find models to teach from/i.test(b.textContent ?? '')
    )!;
    act(() => button.click());
    expect(load).toHaveBeenCalledWith(
      '/api/domain/assignment-insights/models?classAssignmentId=ca-1'
    );
  });

  it('shows the strong model beside the instructive example, with questions for each', () => {
    fetcher.data = { models: MODELS };
    const el = render(<ClassModelsSection classAssignmentId="ca-1" />);

    const exemplar = el.querySelector('[data-testid="class-models-exemplar"]')!;
    const instructive = el.querySelector(
      '[data-testid="class-models-instructive"]'
    )!;
    expect(el.textContent).toMatch(/show what works/i);
    expect(el.textContent).toMatch(/learn from together/i);
    expect(exemplar.textContent).toContain('hope is a choice');
    expect(exemplar.querySelector('a')?.getAttribute('href')).toBe(
      '/app/submissions/sub-ava'
    );
    expect(exemplar.textContent).toContain('5/5');
    expect(instructive.textContent).toContain('This proves my point');
    expect(instructive.textContent).toContain('Ben Ito');
    expect(instructive.textContent).toMatch(/remove the student’s name/i);
  });

  it('says so when the graded work has nothing to compare yet', () => {
    fetcher.data = { models: null };
    const el = render(<ClassModelsSection classAssignmentId="ca-1" />);
    expect(el.textContent).toMatch(/grade a few more/i);
  });
});
