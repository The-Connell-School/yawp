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

/** The drop-down button for a section, found by its heading text. */
const toggle = (root: HTMLElement, name: string) =>
  [...root.querySelectorAll('button')].find((b) => b.textContent === name);

function open(button: HTMLButtonElement | undefined) {
  if (!button) throw new Error('no such drop-down');
  act(() => button.click());
}

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
  it('shows the first paragraph and keeps the rest behind Read more', () => {
    const root = render(<LandingDescription page={LANDING_PAGES.prewriting} />);
    expect(root.querySelectorAll('p')).toHaveLength(1);
    expect(root.querySelector('p strong')?.textContent).toBe(
      'Step 1 of the Yawp! writing process.'
    );
    expect(root.textContent).not.toContain('big, hot, rambling mess');
    expect(root.querySelector('h2')).toBeNull();

    const more = toggle(root, 'Read more');
    expect(more?.getAttribute('aria-expanded')).toBe('false');
    open(more);
    expect(root.querySelectorAll('p')).toHaveLength(2);
    expect(root.textContent).toContain('big, hot, rambling mess');
    expect(toggle(root, 'Show less')?.getAttribute('aria-expanded')).toBe('true');
  });

  it('has no Read more when the description is one paragraph', () => {
    const root = render(<LandingDescription page={LANDING_PAGES['exit-ticket']} />);
    expect(root.querySelectorAll('p')).toHaveLength(1);
    expect(toggle(root, 'Read more')).toBeUndefined();
  });
});

describe('LandingSections', () => {
  it("lays out Exit Ticket's sections with Brian's headings, closed until a teacher opens one", () => {
    const root = render(
      <LandingSections page={LANDING_PAGES['exit-ticket']} modules={[]} />
    );
    expect(headings(root)).toEqual([
      'How it works',
      'What makes a good exit ticket',
    ]);
    // Closed by default: the heading shows, the wall of text does not.
    const how = toggle(root, 'How it works');
    expect(how?.getAttribute('aria-expanded')).toBe('false');
    expect(root.textContent).not.toContain('Tutor off or on?');

    open(how);
    expect(how?.getAttribute('aria-expanded')).toBe('true');
    const leads = [...root.querySelectorAll('strong')].map((s) => s.textContent);
    expect(leads).toContain('Tutor off or on?');
    expect(leads).toContain('Grading is optional.');
    expect(leads).toContain('New');

    open(toggle(root, 'What makes a good exit ticket'));
    expect(root.querySelectorAll('ul > li')).toHaveLength(5);
    expect(root.textContent).not.toContain('Modules');
  });

  it('collapses How it works, When to use it, and the what-makes-a-good-one lists, on every page', () => {
    const collapsible = new Set([
      'How it works',
      'When to use it',
      'What makes a good exit ticket',
      'What makes a strong thesis',
    ]);
    for (const page of Object.values(LANDING_PAGES)) {
      const root = render(<LandingSections page={page} modules={THESIS_MODULES} />);
      for (const section of page.sections) {
        const button = toggle(root, section.heading);
        expect({ page: page.key, section: section.id, dropDown: !!button }).toEqual({
          page: page.key,
          section: section.id,
          dropDown: collapsible.has(section.heading),
        });
        if (button) expect(button.getAttribute('aria-expanded')).toBe('false');
      }
      act(() => activeRoot?.unmount());
      activeRoot = null;
    }
  });

  it('keeps How to Teach It and the Prompt Library intro open', () => {
    const root = render(
      <LandingSections page={LANDING_PAGES['thesis-driven-essay']} modules={[]} />
    );
    expect(toggle(root, 'How to Teach It')).toBeUndefined();
    expect(root.querySelector('[data-testid="thesis-essay-course"]')).not.toBeNull();
    expect(root.textContent).toContain('Have your own prompt?');
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

  it("shows the Thesis-Driven Essay course under How to Teach It, as in Brian's mock-up", () => {
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
    const card = root.querySelector('[data-testid="thesis-essay-course"]')!;
    expect(card.querySelector('h3')?.textContent).toBe(
      'The Thesis-Driven Essay course'
    );
    const rows = [...card.querySelectorAll('[data-testid="course-lesson"]')];
    expect(rows.map((row) => row.querySelector('[data-lesson-title]')?.textContent)).toEqual([
      'Introduce students to Yawp!',
      'Pre-writing',
      'Developing a thesis statement',
      'Introduction paragraph',
      'Body paragraphs',
      'The conclusion',
      'Titling your essay',
      'Review my essay',
    ]);
    // The course replaces the module rows; it does not repeat them.
    expect(root.querySelectorAll('[data-testid="how-to-teach-step"]')).toHaveLength(0);
  });

  it('opens a lesson plan in a new tab and downloads a slide deck', () => {
    const root = render(
      <LandingSections page={LANDING_PAGES['thesis-driven-essay']} modules={[]} />
    );
    const rows = [...root.querySelectorAll('[data-testid="course-lesson"]')];
    const prewriting = rows[1]!;
    const plan = [...prewriting.querySelectorAll('a')].find(
      (a) => a.textContent === 'Lesson plan'
    )!;
    expect(plan.getAttribute('href')).toBe(
      '/courses/thesis-driven-essay/02-lesson-plan-pre-writing.pdf'
    );
    expect(plan.getAttribute('target')).toBe('_blank');
    expect(plan.getAttribute('rel')).toContain('noopener');
    expect(plan.getAttribute('aria-label')).toBe('Pre-writing: lesson plan (PDF)');

    const slides = [...prewriting.querySelectorAll('a')].find(
      (a) => a.textContent === 'Slide deck'
    )!;
    expect(slides.getAttribute('href')).toBe(
      '/courses/thesis-driven-essay/02-pre-writing.pptx'
    );
    expect(slides.getAttribute('download')).toBe('Pre-Writing.pptx');
    expect(slides.getAttribute('aria-label')).toBe('Pre-writing: slide deck (PowerPoint)');

    // Body paragraphs has both of its decks.
    expect(
      [...rows[4]!.querySelectorAll('a')].map((a) => a.textContent)
    ).toEqual(['Lesson plan', 'Slide deck', 'Supporting quotes']);
    // Titling has a deck only; Review my essay has nothing to open.
    expect([...rows[6]!.querySelectorAll('a')].map((a) => a.textContent)).toEqual([
      'Slide deck',
    ]);
    expect(rows[7]!.querySelectorAll('a')).toHaveLength(0);
  });

  it('lines the links up in the same two columns on every row', () => {
    const root = render(
      <LandingSections page={LANDING_PAGES['thesis-driven-essay']} modules={[]} />
    );
    const rows = [...root.querySelectorAll('[data-testid="course-lesson"]')];
    for (const row of rows) {
      // Every row has both columns, empty or not, so links never shift.
      expect(row.querySelectorAll('[data-course-column="lesson-plan"]')).toHaveLength(1);
      expect(row.querySelectorAll('[data-course-column="slide-deck"]')).toHaveLength(1);
    }
    const column = (row: Element, name: string) =>
      [...row.querySelector(`[data-course-column="${name}"]`)!.querySelectorAll('a')].map(
        (a) => a.textContent
      );
    // Body paragraphs' second deck sits under its first, in the deck column.
    expect(column(rows[4]!, 'lesson-plan')).toEqual(['Lesson plan']);
    expect(column(rows[4]!, 'slide-deck')).toEqual(['Slide deck', 'Supporting quotes']);
    // Titling has no lesson plan, so its deck stays in the deck column.
    expect(column(rows[6]!, 'lesson-plan')).toEqual([]);
    expect(column(rows[6]!, 'slide-deck')).toEqual(['Slide deck']);
  });

  it('lists the 5-Paragraph Essay steps from its modules', () => {
    const root = render(
      <LandingSections
        page={LANDING_PAGES['five-paragraph-essay']}
        modules={THESIS_MODULES}
      />
    );
    const rows = root.querySelectorAll('[data-testid="how-to-teach-step"]');
    expect(rows).toHaveLength(4);
    expect(root.querySelectorAll('a')).toHaveLength(0);
  });

  it('renders no steps when a multi-step page somehow has no modules', () => {
    const root = render(
      <LandingSections page={LANDING_PAGES['five-paragraph-essay']} modules={[]} />
    );
    expect(root.querySelectorAll('[data-testid="how-to-teach-step"]')).toHaveLength(0);
    expect(root.textContent).not.toContain('Teach these steps in order.');
  });
});
