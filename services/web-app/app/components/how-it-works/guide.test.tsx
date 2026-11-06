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

const {
  Eyebrow,
  GuideCard,
  GuideCopy,
  GuideFooter,
  GuideHero,
  GuidePage,
  GuidePanel,
  GuideSection,
  GuideStep,
  WillWont,
} = await import('./guide');
const { GUIDE_ACCENTS, guideAccentFor } = await import('./guide-accents');

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

const FOREST = '#1F4D3A';
const classes = (el: Element | null | undefined) => el?.className.split(/\s+/) ?? [];

function page(accent: string | undefined) {
  return (
    <GuidePage backTo="/app" backLabel="Back" accent={accent}>
      <GuideHero
        title="Teach the thesis-driven essay"
        highlight="one step at a time."
        lede="A lede."
        image={{ src: '/x.jpg', alt: 'x', width: 10, height: 10, caption: 'cap' }}
      />
      <GuideSection id="s1" eyebrow="How it works" title="Teach it, step by step">
        <GuideStep n={1}>The teacher creates the assignment</GuideStep>
        <GuideCopy>Body copy.</GuideCopy>
      </GuideSection>
      <GuidePanel id="p1" title="How the Tutor works with students" intro="Panel intro.">
        <GuideCard>
          <GuideCopy>Card copy.</GuideCopy>
        </GuideCard>
      </GuidePanel>
      <WillWont will={['Will this.']} wont={['Won’t that.']} />
      <GuideFooter note="Note." startTo="/go" startLabel="Create an assignment" />
    </GuidePage>
  );
}

describe('the guide accents (Brian, Nov 5)', () => {
  it('is six colors, and the Thesis-Driven Essay page gets forest green, Class Starter maroon', () => {
    expect(Object.keys(GUIDE_ACCENTS).sort()).toEqual(['charcoal', 'forest', 'ink', 'maroon', 'navy', 'petrol']);
    expect(guideAccentFor('thesis-driven-essay')).toBe(FOREST);
    expect(guideAccentFor('class-starter')).toBe('#6E1A26');
    expect(guideAccentFor('daily-pages')).toBeNull();
  });
});

describe('a guide with a page accent (Brian, Nov 5)', () => {
  it('sets the accent once on the page, as a token', () => {
    const root = render(page(FOREST));
    const section = root.querySelector('[data-guide-accent]')!;
    expect(section.getAttribute('data-guide-accent')).toBe(FOREST);
    expect((section as HTMLElement).style.getPropertyValue('--page-accent')).toBe(FOREST);
  });

  it('has no eyebrow labels, and a one-color headline', () => {
    const root = render(page(FOREST));
    expect(root.querySelectorAll('[data-eyebrow]')).toHaveLength(0);
    expect(root.textContent).not.toContain('See how it works');
    expect(root.textContent).not.toContain('How it works');
    const h1 = root.querySelector('h1')!;
    expect(h1.textContent).toBe('Teach the thesis-driven essay one step at a time.');
    expect(h1.querySelector('span')).toBeNull();
    expect(classes(h1)).toContain('text-[#1A1F2E]');
    // Section headings are the heading color; a panel's heading is white on the accent.
    for (const h2 of root.querySelectorAll('h2')) {
      expect(classes(h2)).toContain(h2.closest('[data-guide-panel]') ? 'text-white' : 'text-[#1A1F2E]');
    }
  });

  it('fills the step circle with the accent and a white numeral', () => {
    const root = render(page(FOREST));
    const circle = root.querySelector('[data-guide-step]')!;
    expect(classes(circle)).toContain('bg-[var(--page-accent)]');
    expect(classes(circle)).toContain('text-white');
    expect(circle.textContent).toBe('1');
  });

  it('paints the feature panels with the accent: white heading, white cards with a soft shadow and no border', () => {
    const root = render(page(FOREST));
    const panels = [...root.querySelectorAll('[data-guide-panel]')];
    expect(panels.length).toBe(2); // the panel and What it will do / won’t
    for (const panel of panels) {
      expect(classes(panel)).toContain('bg-[var(--page-accent)]');
      expect(classes(panel.querySelector('h2'))).toContain('text-white');
    }
    const intro = panels[0]!.querySelector('[data-guide-panel-intro]')!;
    expect(classes(intro)).toContain('text-white/[0.86]');
    const cards = [...root.querySelectorAll('[data-guide-card]')];
    expect(cards.length).toBe(3);
    for (const card of cards) {
      expect(classes(card)).toContain('bg-white');
      expect(classes(card)).toContain('shadow-[0_2px_8px_rgba(0,0,0,0.18)]');
      expect(classes(card)).not.toContain('border');
    }
  });

  it('darkens body text, and colors the check and X icons like the text, not the accent', () => {
    const root = render(page(FOREST));
    for (const p of root.querySelectorAll('[data-guide-copy]')) expect(classes(p)).toContain('text-[#3A3F4B]');
    const icons = [...root.querySelectorAll('[data-testid="guide-wont"] svg, [data-guide-will] svg')];
    expect(icons.length).toBe(2);
    for (const icon of icons) {
      expect(classes(icon)).toContain('text-[#3A3F4B]');
      expect(classes(icon)).not.toContain('text-primary');
    }
  });

  it('puts the accent on the primary button, white text', () => {
    const root = render(page(FOREST));
    const button = [...root.querySelectorAll('a')].find((a) => a.textContent === 'Create an assignment')!;
    expect(classes(button)).toContain('bg-[var(--page-accent)]');
    expect(classes(button)).toContain('text-white');
    expect(classes(button)).not.toContain('bg-primary');
  });

  it('uses the accent nowhere as text: no terracotta left on the page', () => {
    const root = render(page(FOREST));
    for (const el of root.querySelectorAll('*')) {
      expect({ tag: el.tagName, classes: classes(el).filter((c) => /(^|:)(text|border|bg)-primary(\/|$)/.test(c)) }).toEqual({ tag: el.tagName, classes: [] });
    }
  });
});

describe('a guide without an accent keeps the classic look (Reporter)', () => {
  it('still shows the eyebrows and the two-color headline', () => {
    const root = render(page(undefined));
    expect(root.querySelector('[data-guide-accent]')).toBeNull();
    expect(root.querySelectorAll('[data-eyebrow]').length).toBeGreaterThanOrEqual(3);
    expect(root.querySelector('h1 span')?.textContent).toBe('one step at a time.');
    expect(classes(root.querySelector('h1 span'))).toContain('text-primary');
    expect(classes(root.querySelector('[data-guide-step]'))).toContain('border-primary');
    for (const panel of root.querySelectorAll('[data-guide-panel]')) expect(classes(panel)).toContain('bg-secondary');
  });

  it('renders an Eyebrow on its own', () => {
    const root = render(<Eyebrow>At a glance</Eyebrow>);
    expect(root.querySelector('[data-eyebrow]')?.textContent).toBe('At a glance');
  });
});
