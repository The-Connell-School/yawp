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
import { MemoryRouter } from 'react-router';

const { LandingDescription, LandingSections, RichText } = await import(
  './assignment-type-landing'
);
const { LANDING_PAGES } = await import('./content');

let activeRoot: Root | null = null;
let container: HTMLDivElement | null = null;

function render(element: ReactElement) {
  container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(<MemoryRouter>{element}</MemoryRouter>);
  });
  activeRoot = root;
  return container;
}

afterEach(() => {
  if (activeRoot) {
    act(() => activeRoot?.unmount());
    activeRoot = null;
  }
  container?.remove();
  container = null;
});

const headings = (root: HTMLElement) =>
  [...root.querySelectorAll('h2')].map((h) => h.textContent);

const THESIS_MODULES = [
  { id: 'm0', title: 'Welcome to Yawp! ' },
  { id: 'm1', title: 'Pre-writing' },
  { id: 'm2', title: 'Thesis Statement' },
  { id: 'm3', title: 'Introduction Paragraph' },
];

describe('RichText', () => {
  it('renders **bold** and *italic* runs and leaves the rest as text', () => {
    const root = render(
      <p>
        <RichText text="**Tutor on or off?** You choose. Think...*before you write.*" />
      </p>
    );
    expect(root.querySelector('strong')?.textContent).toBe('Tutor on or off?');
    expect(root.querySelector('em')?.textContent).toBe('before you write.');
    expect(root.textContent).toBe(
      'Tutor on or off? You choose. Think...before you write.'
    );
  });
});

describe('LandingDescription', () => {
  it('renders every description paragraph with no heading', () => {
    const root = render(<LandingDescription page={LANDING_PAGES.prewriting} />);
    const paragraphs = [...root.querySelectorAll('p')];
    expect(paragraphs).toHaveLength(2);
    expect(paragraphs[0]!.querySelector('strong')?.textContent).toBe(
      'Step 1 of the Yawp! writing process.'
    );
    expect(root.querySelector('h2')).toBeNull();
  });
});

describe('LandingSections', () => {
  it("lays out Exit Ticket's sections with Brian's headings and bold leads", () => {
    const root = render(
      <LandingSections page={LANDING_PAGES['exit-ticket']} modules={[]} />
    );
    expect(headings(root)).toEqual([
      'How it works',
      'What makes a good exit ticket',
    ]);
    const leads = [...root.querySelectorAll('strong')].map((s) => s.textContent);
    expect(leads).toContain('Tutor off or on?');
    expect(leads).toContain('Grading is optional.');
    expect(leads).toContain('New');
    expect(root.querySelectorAll('ul > li')).toHaveLength(5);
    expect(root.textContent).not.toContain('Modules');
  });

  it('labels the Prompt Library intro for screen readers only, since the library below carries the visible label', () => {
    const root = render(
      <LandingSections page={LANDING_PAGES['class-starter']} modules={[]} />
    );
    const libraryHeading = [...root.querySelectorAll('h2')].find(
      (h) => h.textContent === 'Prompt Library'
    );
    expect(libraryHeading?.className).toContain('sr-only');
    expect(root.textContent).toContain(
      'Need an idea to get students thinking? Browse the library!'
    );
  });

  it('turns the Thesis-Driven Essay modules into How to Teach It, one row per module with its stack and video', () => {
    const root = render(
      <LandingSections
        page={LANDING_PAGES['thesis-driven-essay']}
        modules={THESIS_MODULES}
      />
    );
    expect(headings(root)[0]).toBe('How to Teach It');
    expect(root.textContent).toContain(
      'Teach these steps in order! (Did we mention that?)'
    );
    const rows = [...root.querySelectorAll('[data-testid="how-to-teach-step"]')];
    expect(rows.map((row) => row.querySelector('[data-step-title]')?.textContent)).toEqual([
      'Welcome to Yawp!',
      'Pre-writing',
      'Thesis Statement',
      'Introduction Paragraph',
    ]);
    for (const row of rows) {
      // Stacks and videos are still to be built.
      expect(row.textContent).toContain('Lesson stack');
      expect(row.textContent).toContain('Tutorial video');
      expect(row.querySelectorAll('a')).toHaveLength(0);
      expect(row.querySelectorAll('[aria-disabled="true"]')).toHaveLength(2);
    }
  });

  it('links a step to its stack and video once they exist', () => {
    const root = render(
      <LandingSections
        page={LANDING_PAGES['thesis-driven-essay']}
        modules={THESIS_MODULES}
        stepResources={{
          'pre-writing': {
            stackHref: '/app/lesson-planner/stacks/pre-writing',
            videoHref: '/app/teachers-lounge/pre-writing',
          },
        }}
      />
    );
    const row = [...root.querySelectorAll('[data-testid="how-to-teach-step"]')][1]!;
    const links = [...row.querySelectorAll('a')];
    expect(links.map((a) => a.getAttribute('href'))).toEqual([
      '/app/lesson-planner/stacks/pre-writing',
      '/app/teachers-lounge/pre-writing',
    ]);
  });

  it('lists the 5-Paragraph Essay steps without stack or video links', () => {
    const root = render(
      <LandingSections
        page={LANDING_PAGES['five-paragraph-essay']}
        modules={THESIS_MODULES}
      />
    );
    const rows = root.querySelectorAll('[data-testid="how-to-teach-step"]');
    expect(rows).toHaveLength(4);
    expect(root.textContent).not.toContain('Lesson stack');
  });

  it('renders no steps when a multi-step page somehow has no modules', () => {
    const root = render(
      <LandingSections page={LANDING_PAGES['thesis-driven-essay']} modules={[]} />
    );
    expect(root.querySelectorAll('[data-testid="how-to-teach-step"]')).toHaveLength(0);
    expect(root.textContent).not.toContain('Teach these steps in order!');
  });
});
