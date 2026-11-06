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
  it('always shows the whole description: never collapsed or cut short (Brian)', () => {
    for (const page of Object.values(LANDING_PAGES)) {
      const root = render(<LandingDescription page={page} />);
      expect({ page: page.key, paragraphs: root.querySelectorAll('p').length }).toEqual({
        page: page.key,
        paragraphs: page.description.length,
      });
      expect(root.querySelector('button')).toBeNull();
      expect(root.textContent).not.toContain('Read more');
      act(() => activeRoot?.unmount());
      activeRoot = null;
    }
    const root = render(<LandingDescription page={LANDING_PAGES.prewriting} />);
    expect(root.querySelector('p strong')?.textContent).toBe(
      'Step 1 of the Yawp! writing process.'
    );
    expect(root.textContent).toContain('big, hot, rambling mess');
    expect(root.querySelector('h2')).toBeNull();
  });
});

describe("Brian's Nov 3 round 2", () => {
  const buttonByLabel = (root: HTMLElement, label: string) =>
    root.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`) ?? undefined;

  it('How to Teach It opens expanded, and a teacher can collapse it to a two-line preview', () => {
    const root = render(
      <LandingSections page={LANDING_PAGES['thesis-driven-essay']} modules={[]} />
    );
    const box = root.querySelector('[data-testid="how-to-teach-spotlight"]')!;
    const hide = buttonByLabel(root, 'Hide How to Teach It');
    expect(hide?.getAttribute('aria-expanded')).toBe('true');
    expect(hide?.textContent).toBe('Hide');
    expect(box.querySelector('[data-testid="thesis-essay-course"]')).not.toBeNull();

    open(hide);
    const show = buttonByLabel(root, 'Show How to Teach It');
    expect(show?.getAttribute('aria-expanded')).toBe('false');
    expect(show?.textContent).toBe('Show');
    // Collapsed: the heading and a two-line preview of the paragraph stay.
    expect(box.querySelector('h2')?.textContent).toBe('How to Teach It');
    const preview = box.querySelector('[data-testid="how-to-teach-preview"]')!;
    expect(preview.className).toContain('line-clamp-2');
    expect(preview.textContent).toContain('The Yawp! process is what we wish');
    expect(box.querySelector('[data-testid="thesis-essay-course"]')).toBeNull();
    expect(box.textContent).not.toContain('Teach these steps in order!');

    open(show);
    expect(buttonByLabel(root, 'Hide How to Teach It')?.getAttribute('aria-expanded')).toBe('true');
    expect(box.querySelector('[data-testid="thesis-essay-course"]')).not.toBeNull();
  });

  it('every How to Teach It box can collapse, the step lists included', () => {
    for (const key of ['five-paragraph-essay', 'act-writing'] as const) {
      const root = render(<LandingSections page={LANDING_PAGES[key]} modules={THESIS_MODULES} />);
      open(buttonByLabel(root, 'Hide How to Teach It'));
      expect(root.querySelectorAll('[data-testid="how-to-teach-step"]')).toHaveLength(0);
      act(() => activeRoot?.unmount());
      activeRoot = null;
    }
  });

  it('an opened drop-down shows its text in the same kind of box as How to Teach It', () => {
    const root = render(<LandingSections page={LANDING_PAGES['class-starter']} modules={[]} />);
    expect(root.querySelector('[data-testid="landing-section-panel"]')).toBeNull();
    open(toggle(root, 'How it works'));
    const panel = root.querySelector('[data-testid="landing-section-panel"]')!;
    expect(panel.textContent).toContain('Tutor on or off?');
    const classes = panel.className.split(/\s+/);
    expect(classes).toContain('hover:-translate-y-0.5');
    expect(classes).toContain('rounded-2xl');
    expect(classes.some((c) => c.startsWith('bg-['))).toBe(true);
  });

  it('text on the cream page is the dark text color; text in the light boxes keeps its softer color', () => {
    const tone = (el: Element | null) => {
      const classes = el?.className.split(/\s+/) ?? [];
      return classes.includes('text-foreground')
        ? 'dark'
        : classes.includes('text-muted-foreground')
          ? 'soft'
          : 'other';
    };
    // The description, beside the image.
    const desc = render(<LandingDescription page={LANDING_PAGES.prewriting} />);
    for (const p of desc.querySelectorAll('p')) expect(tone(p)).toBe('dark');
    act(() => activeRoot?.unmount());
    activeRoot = null;

    // Pre-Writing: the Prompt Library intro and its Note sit on the page.
    const root = render(<LandingSections page={LANDING_PAGES.prewriting} modules={[]} />);
    const library = root.querySelector('[data-testid="landing-section-prompt-library"]')!;
    const libraryParagraphs = [...library.querySelectorAll('p')];
    expect(libraryParagraphs.length).toBe(2);
    for (const p of libraryParagraphs) expect(tone(p)).toBe('dark');
    // Inside an opened drop-down's box, the text stays as it is in How to Teach It.
    open(toggle(root, 'How it works'));
    for (const p of root.querySelectorAll('[data-testid="landing-section-panel"] p')) {
      expect(tone(p)).toBe('soft');
    }
    act(() => activeRoot?.unmount());
    activeRoot = null;

    const tde = render(
      <LandingSections page={LANDING_PAGES['thesis-driven-essay']} modules={[]} />
    );
    const paragraph = tde.querySelector('[data-testid="how-to-teach-spotlight"] p');
    expect(tone(paragraph)).toBe('soft');
  });
});

describe('How to Teach It spotlight', () => {
  it('sets How to Teach It off in a lighter box that rises on hover, like the Units boxes', () => {
    for (const key of ['thesis-driven-essay', 'five-paragraph-essay', 'act-writing'] as const) {
      const root = render(
        <LandingSections page={LANDING_PAGES[key]} modules={THESIS_MODULES} />
      );
      const box = root.querySelector('[data-testid="how-to-teach-spotlight"]')!;
      expect({ key, boxed: !!box }).toEqual({ key, boxed: true });
      // The heading, the copy and the lessons are all inside the box.
      expect(box.querySelector('h2')?.textContent).toBe('How to Teach It');
      expect(box.textContent).toContain('Teach the');
      const classes = box.className.split(/\s+/);
      expect(classes).toContain('hover:-translate-y-0.5');
      // Keyboard focus lifts it too, but a mouse click on Hide/Show does not
      // leave it raised.
      expect(classes).toContain('has-[:focus-visible]:-translate-y-0.5');
      expect(classes.some((c) => c.startsWith('focus-within:'))).toBe(false);
      expect(classes).toContain('motion-reduce:hover:translate-y-0');
      expect(classes.some((c) => c.startsWith('hover:shadow-'))).toBe(true);
      act(() => activeRoot?.unmount());
      activeRoot = null;
    }
  });

  it('puts the course inside the box without a second border around it', () => {
    const root = render(
      <LandingSections page={LANDING_PAGES['thesis-driven-essay']} modules={[]} />
    );
    const box = root.querySelector('[data-testid="how-to-teach-spotlight"]')!;
    const course = box.querySelector('[data-testid="thesis-essay-course"]')!;
    expect(course).not.toBeNull();
    expect(course.className).not.toContain('shadow');
    expect(course.className.split(/\s+/)).not.toContain('border');
  });

  it('boxes only How to Teach It', () => {
    for (const page of Object.values(LANDING_PAGES)) {
      const root = render(<LandingSections page={page} modules={THESIS_MODULES} />);
      const boxed = root.querySelectorAll('[data-testid="how-to-teach-spotlight"]').length;
      const hasHowToTeach = page.sections.some((s) => s.id === 'how-to-teach-it');
      expect({ page: page.key, boxed }).toEqual({ page: page.key, boxed: hasHowToTeach ? 1 : 0 });
      act(() => activeRoot?.unmount());
      activeRoot = null;
    }
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

  it('downloads a slide deck, and watches the tutorial where the teacher can open the course (Brian, Nov 6)', () => {
    const root = render(
      <LandingSections
        page={LANDING_PAGES['thesis-driven-essay']}
        modules={[]}
        lessonVideos={{ 2: '/app/teacher-trainings/c1/modules/m7', 5: '/app/teacher-trainings/c1/modules/m10' }}
      />
    );
    const rows = [...root.querySelectorAll('[data-testid="course-lesson"]')];
    const prewriting = rows[1]!;
    const slides = [...prewriting.querySelectorAll('a')].find((a) => a.textContent === 'Slide deck')!;
    expect(slides.getAttribute('href')).toBe('/courses/thesis-driven-essay/02-pre-writing.pptx');
    expect(slides.getAttribute('download')).toBe('Pre-Writing.pptx');
    expect(slides.getAttribute('aria-label')).toBe('Pre-writing: slide deck (PowerPoint)');
    const video = [...prewriting.querySelectorAll('a')].find((a) => a.textContent === 'Watch tutorial')!;
    expect(video.getAttribute('href')).toBe('/app/teacher-trainings/c1/modules/m7');
    expect(video.getAttribute('aria-label')).toBe('Pre-writing: tutorial video');
    // No lesson plan link of any kind: not the PDF, not the planner.
    expect([...root.querySelectorAll('a')].filter((a) => /lesson plan/i.test(a.textContent ?? ''))).toHaveLength(0);
    expect(root.querySelectorAll('a[href$=".pdf"]')).toHaveLength(0);
    expect(root.querySelectorAll('a[href^="/app/lesson-planner/yawp/"]')).toHaveLength(0);

    // Body paragraphs has both of its decks, and its video.
    expect([...rows[4]!.querySelectorAll('a')].map((a) => a.textContent)).toEqual([
      'Slide deck',
      'Supporting quotes',
      'Watch tutorial',
    ]);
    // A lesson with no video module has the deck only; Review my essay has nothing.
    expect([...rows[6]!.querySelectorAll('a')].map((a) => a.textContent)).toEqual(['Slide deck']);
    expect(rows[7]!.querySelectorAll('a')).toHaveLength(0);
  });

  it('shows no video links at all when the teacher cannot open the course', () => {
    const root = render(
      <LandingSections page={LANDING_PAGES['thesis-driven-essay']} modules={[]} />
    );
    expect([...root.querySelectorAll('a')].map((a) => a.textContent)).not.toContain('Watch tutorial');
    expect(root.querySelectorAll('[data-course-column="slide-deck"] a').length).toBeGreaterThanOrEqual(7);
  });

  it('lines the links up in the same two columns on every row', () => {
    const root = render(
      <LandingSections
        page={LANDING_PAGES['thesis-driven-essay']}
        modules={[]}
        lessonVideos={{ 5: '/app/teacher-trainings/c1/modules/m10' }}
      />
    );
    const rows = [...root.querySelectorAll('[data-testid="course-lesson"]')];
    for (const row of rows) {
      // Every row has both columns, empty or not, so links never shift.
      expect(row.querySelectorAll('[data-course-column="slide-deck"]')).toHaveLength(1);
      expect(row.querySelectorAll('[data-course-column="tutorial"]')).toHaveLength(1);
    }
    const column = (row: Element, name: string) =>
      [...row.querySelector(`[data-course-column="${name}"]`)!.querySelectorAll('a')].map(
        (a) => a.textContent
      );
    // Body paragraphs' second deck sits under its first, in the deck column.
    expect(column(rows[4]!, 'slide-deck')).toEqual(['Slide deck', 'Supporting quotes']);
    expect(column(rows[4]!, 'tutorial')).toEqual(['Watch tutorial']);
    // Titling has no video module here, so its tutorial column is empty.
    expect(column(rows[6]!, 'slide-deck')).toEqual(['Slide deck']);
    expect(column(rows[6]!, 'tutorial')).toEqual([]);
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

describe('The step pages’ own lesson row (Kevin, Nov 5; Brian, Nov 6: deck and video)', () => {
  const links = (row: Element) =>
    [...row.querySelectorAll('a')].map((a) => ({ text: a.textContent, href: a.getAttribute('href'), label: a.getAttribute('aria-label') }));

  it.each([
    ['prewriting', 'Pre-writing', 2, '02-pre-writing.pptx'],
    ['thesis-statement', 'Developing a thesis statement', 3, '03-develop-your-thesis-statement.pptx'],
  ] as const)('%s shows How to Teach It first, with its one lesson row', (key, title, number, deck) => {
    const videos = { [number]: `/app/teacher-trainings/c1/modules/m${number}` };
    const root = render(<LandingSections page={LANDING_PAGES[key]} modules={[]} lessonVideos={videos} />);
    expect(headings(root)[0]).toBe('How to Teach It');
    const box = root.querySelector('[data-testid="how-to-teach-spotlight"]')!;
    expect(box.textContent).toContain('watch the short tutorial video before you teach it');
    const rows = [...box.querySelectorAll('[data-testid="yawp-lesson"] [data-testid="course-lesson"]')];
    expect(rows).toHaveLength(1);
    expect(rows[0]!.querySelector('[data-lesson-title]')?.textContent).toBe(title);
    expect(links(rows[0]!)).toEqual([
      { text: 'Slide deck', href: `/courses/thesis-driven-essay/${deck}`, label: `${title}: slide deck (PowerPoint)` },
      { text: 'Watch tutorial', href: `/app/teacher-trainings/c1/modules/m${number}`, label: `${title}: tutorial video` },
    ]);
    // Brian's sections are still there, after it.
    expect(toggle(root, 'How it works')).toBeDefined();
    expect(toggle(root, 'When to use it')).toBeDefined();
    act(() => activeRoot?.unmount());
    activeRoot = null;

    // Without the course: the deck alone.
    const alone = render(<LandingSections page={LANDING_PAGES[key]} modules={[]} />);
    const row = alone.querySelector('[data-testid="yawp-lesson"] [data-testid="course-lesson"]')!;
    expect(links(row).map((a) => a.text)).toEqual(['Slide deck']);
  });

  it('How to Teach It on a step page collapses to its lead like the course does', () => {
    const root = render(<LandingSections page={LANDING_PAGES.prewriting} modules={[]} />);
    const hide = root.querySelector<HTMLButtonElement>('button[aria-label="Hide How to Teach It"]')!;
    open(hide);
    expect(root.querySelector('[data-testid="yawp-lesson"]')).toBeNull();
    expect(root.querySelector('[data-testid="how-to-teach-preview"]')?.textContent).toContain(
      'Lesson 2 of the Thesis-Driven Essay course'
    );
  });
});
