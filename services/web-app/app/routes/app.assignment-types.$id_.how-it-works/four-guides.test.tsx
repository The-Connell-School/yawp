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

const { ClassStarterGuide } = await import('./class-starter-guide');
const { ExitTicketGuide } = await import('./exit-ticket-guide');
const { WritingStepGuide } = await import('./writing-step-guide');
const { WRITING_STEP_COPY } = await import('../app.assignment-types.$id/about-writing-step/content');
const { GUIDE_ACCENTS } = await import('~/components/how-it-works/guide-accents');

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

const PAGE = '/app/assignment-types/at-1';
const VIDEOS = { 2: `${PAGE}/tutorial/2`, 3: `${PAGE}/tutorial/3` };
const GUIDE_BACK = { backTo: PAGE, backLabel: 'Back to assignment type' };

const GUIDES: {
  name: string;
  media: string;
  accent: string;
  element: (v2: boolean) => ReactElement;
}[] = [
  {
    name: 'Class Starter',
    media: '/img/class-starter-guide/overview.mp4',
    accent: GUIDE_ACCENTS.maroon,
    element: (v2) => (
      <ClassStarterGuide {...GUIDE_BACK} pagePath={PAGE} v2={v2} />
    ),
  },
  {
    name: 'Pre-Writing',
    media: '/img/prewriting-guide/overview.mp4',
    accent: GUIDE_ACCENTS.navy,
    element: (v2) => (
      <WritingStepGuide
        {...GUIDE_BACK}
        kind="prewriting"
        copy={WRITING_STEP_COPY.prewriting}
        pagePath={PAGE}
        lesson={null}
        v2={v2}
        lessonVideos={VIDEOS}
      />
    ),
  },
  {
    name: 'Thesis Statement',
    media: '/img/thesis-statement-guide/overview.mp4',
    accent: GUIDE_ACCENTS.petrol,
    element: (v2) => (
      <WritingStepGuide
        {...GUIDE_BACK}
        kind="thesis_statement"
        copy={WRITING_STEP_COPY.thesis_statement}
        pagePath={PAGE}
        lesson={null}
        v2={v2}
        lessonVideos={VIDEOS}
      />
    ),
  },
  {
    name: 'Exit Ticket',
    media: '/img/exit-ticket-guide/overview.mp4',
    accent: GUIDE_ACCENTS.ink,
    element: () => <ExitTicketGuide pagePath={PAGE} />,
  },
];

for (const guide of GUIDES) {
  describe(`${guide.name} How It Works, finalized (Kevin, Nov 10)`, () => {
    it('opens with the headline, then the overview video, then How to Teach It', () => {
      const root = render(guide.element(true));
      const h1 = root.querySelector('h1')!;
      const video = root.querySelector('[data-testid="guide-overview-video"] video')!;
      const howTo = root.querySelector('[data-testid="how-to-teach-spotlight"]')!;
      expect(video.querySelector('source')?.getAttribute('src')).toBe(guide.media);
      expect(h1.compareDocumentPosition(video) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(video.compareDocumentPosition(howTo) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      // Nothing else plays before it: it is the first video on the page.
      expect(root.querySelector('video')).toBe(video as HTMLVideoElement);
    });

    it('How to Teach It is a white card, open on arrival, and Hide folds it to a preview', () => {
      const root = render(guide.element(true));
      const box = root.querySelector('[data-testid="how-to-teach-spotlight"]')!;
      expect(box.querySelector('h2')?.textContent).toBe('How to Teach It');
      expect(box.className.split(/\s+/)).toContain('bg-white');
      const toggle = box.querySelector('button[aria-expanded]') as HTMLButtonElement;
      expect(toggle.getAttribute('aria-expanded')).toBe('true');
      act(() => toggle.click());
      expect(toggle.getAttribute('aria-expanded')).toBe('false');
      expect(box.querySelector('[data-testid="how-to-teach-preview"]')).not.toBeNull();
      act(() => toggle.click());
      expect(toggle.getAttribute('aria-expanded')).toBe('true');
    });

    it('is its own accent color, with white cards in the panels', () => {
      const root = render(guide.element(true));
      expect(root.querySelector('[data-guide-accent]')?.getAttribute('data-guide-accent')).toBe(guide.accent);
      const cards = root.querySelectorAll('[data-guide-card]');
      expect(cards.length).toBeGreaterThan(0);
      for (const card of cards) expect(card.className.split(/\s+/)).toContain('bg-white');
    });
  });
}

describe('the lesson on Pre-Writing and Thesis Statement', () => {
  it('How to Teach It holds the lesson’s slide deck and its tutorial', () => {
    for (const [kind, lesson] of [
      ['prewriting', 2],
      ['thesis_statement', 3],
    ] as const) {
      const root = render(
        <WritingStepGuide
          {...GUIDE_BACK}
          kind={kind}
          copy={WRITING_STEP_COPY[kind]}
          pagePath={PAGE}
          lesson={null}
          v2
          lessonVideos={VIDEOS}
        />
      );
      const box = root.querySelector('[data-testid="how-to-teach-spotlight"]')!;
      const links = [...box.querySelectorAll('a')].map((a) => a.textContent?.trim());
      expect(links.some((t) => /slide deck/i.test(t ?? ''))).toBe(true);
      const tutorial = [...box.querySelectorAll('a')].find((a) => /tutorial/i.test(a.textContent ?? ''));
      expect(tutorial?.getAttribute('href')).toBe(`${PAGE}/tutorial/${lesson}`);
      act(() => activeRoot?.unmount());
      activeRoot = null;
    }
  });
});

describe('with assignment-type-landing-v2 off, the guides stay as they were', () => {
  it('Class Starter keeps its hero picture, and has no video at the top or How to Teach It', () => {
    const root = render(
      <ClassStarterGuide {...GUIDE_BACK} pagePath={PAGE} v2={false} />
    );
    expect(root.querySelector('[data-testid="guide-overview-video"]')).toBeNull();
    expect(root.querySelector('[data-testid="how-to-teach-spotlight"]')).toBeNull();
    expect(root.querySelector('header img')?.getAttribute('src')).toBe('/img/class-starter-guide/hero.jpg');
  });

  it('Pre-Writing has no video at the top or How to Teach It', () => {
    const root = render(
      <WritingStepGuide
        {...GUIDE_BACK}
        kind="prewriting"
        copy={WRITING_STEP_COPY.prewriting}
        pagePath={PAGE}
        lesson={null}
        v2={false}
        lessonVideos={{}}
      />
    );
    expect(root.querySelector('[data-testid="guide-overview-video"]')).toBeNull();
    expect(root.querySelector('[data-testid="how-to-teach-spotlight"]')).toBeNull();
  });
});

describe('the Exit Ticket guide', () => {
  it('says what Brian’s page says a good exit ticket is', () => {
    const root = render(<ExitTicketGuide pagePath={PAGE} />);
    const text = root.textContent ?? '';
    expect(text).toContain('What makes a good exit ticket');
    expect(text).toContain('Ask for one thing.');
    expect(text).toContain('Ask them to explain, not recall.');
    expect(text).toContain('Read them before you plan tomorrow.');
  });

  it('will / won’t: every line one the code holds to', () => {
    const root = render(<ExitTicketGuide pagePath={PAGE} />);
    const will = root.querySelector('[data-testid="guide-will"]')?.textContent ?? '';
    const wont = root.querySelector('[data-testid="guide-wont"]')?.textContent ?? '';
    expect(will).toContain('Start with the Tutor off');
    expect(will).toContain('Leave it ungraded unless you choose to grade it');
    expect(wont).toContain('Grade grammar, spelling, or length.');
    expect(wont).toContain('Send student names to the Tutor.');
    expect(wont).toContain('Show a student a grade before you release it.');
  });

  it('ends with the way back to Exit Ticket', () => {
    const root = render(<ExitTicketGuide pagePath={PAGE} />);
    const back = [...root.querySelectorAll('a')].filter((a) => a.getAttribute('href') === PAGE);
    expect(back.map((a) => a.textContent?.trim())).toEqual(['Back to Exit Ticket', 'Go to Exit Ticket']);
  });
});
