import { GlobalRegistrator } from '@happy-dom/global-registrator';

try {
  GlobalRegistrator.register();
} catch {
  // Multiple Bun test files can share the same process.
}

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { afterEach, describe, expect, it } from 'bun:test';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createMemoryRouter, RouterProvider } from 'react-router';
import type { FacetValues, OptionCounts } from '../thesis-prompts-library/data';

const { AssignmentTypeLibraryTabs } = await import('./assignment-type-library-tabs');
const { ThesisPromptsLibrary } = await import(
  '../thesis-prompts-library/thesis-prompts-library'
);
const { ThesisTeacherDirections } = await import(
  '../thesis-prompts-library/thesis-teacher-directions'
);

const emptyFacets: FacetValues = {
  collections: ['library', 'mine'],
  categories: [],
  subjects: [],
  textsOrUnits: [],
  cognitiveMoves: [],
  gradeBands: [],
};

const emptyCounts: OptionCounts = {
  collections: { library: 0, mine: 0 },
  categories: {},
  subjects: {},
  textsOrUnits: {},
  cognitiveMoves: {},
  gradeBands: {},
};

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function render(element: React.ReactElement) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  const router = createMemoryRouter([{ path: '/', element }]);
  act(() => root!.render(<RouterProvider router={router} />));
  return container;
}

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

describe('AssignmentTypeLibraryTabs', () => {
  it('shows underline tabs with the how-it-works panel selected by default', () => {
    const view = render(
      <AssignmentTypeLibraryTabs
        howItWorksLabel="How it works"
        howItWorksPanel={<ThesisTeacherDirections />}
        promptLibraryPanel={
          <ThesisPromptsLibrary
            prompts={[]}
            facets={emptyFacets}
            optionCounts={emptyCounts}
            totalCount={0}
            onSelectPrompt={() => {}}
          />
        }
      />
    );

    expect(view.textContent).toContain('How it works');
    expect(view.textContent).toContain('Prompt library');
    expect(
      view.querySelector('[data-tour="type-directions"]')?.textContent
    ).toContain('How the Thesis-Driven Essay library works');
    expect(view.querySelector('[data-tour="type-library"]')).not.toBeNull();
  });

  it('shows the prompt library panel when that tab is the default', () => {
    const view = render(
      <AssignmentTypeLibraryTabs
        defaultTab="prompt-library"
        howItWorksLabel="How it works"
        howItWorksPanel={<ThesisTeacherDirections />}
        promptLibraryPanel={
          <ThesisPromptsLibrary
            prompts={[]}
            facets={emptyFacets}
            optionCounts={emptyCounts}
            totalCount={0}
            onSelectPrompt={() => {}}
          />
        }
      />
    );

    expect(
      view
        .querySelector('[data-tour="type-library"]')
        ?.querySelector('#thesis-prompt-library-heading')
    ).not.toBeNull();
  });
});
