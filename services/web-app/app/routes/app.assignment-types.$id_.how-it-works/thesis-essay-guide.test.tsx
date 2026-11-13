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
import { MemoryRouter } from 'react-router';

const { ThesisEssayGuide } = await import('./thesis-essay-guide');

let activeRoot: Root | null = null;
let container: HTMLDivElement | null = null;

function render() {
  container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <MemoryRouter>
        <ThesisEssayGuide pagePath="/app/assignment-types/at-1" coursePath="/app/teacher-trainings/t-1" />
      </MemoryRouter>
    );
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

describe('The Thesis-Driven Essay guide, restyled (Brian, Nov 5)', () => {
  it('is the forest green page: no eyebrows, one-color headline, accent panels', () => {
    const root = render();
    expect(root.querySelector('[data-guide-accent]')?.getAttribute('data-guide-accent')).toBe('#1F4D3A');
    expect(root.querySelectorAll('[data-eyebrow]')).toHaveLength(0);
    for (const label of ['See how it works', 'The assignment', 'The Yawp! Tutor', 'Grade and release', 'Bonus tip', 'At a glance']) {
      expect({ label, shown: root.textContent?.includes(label) }).toEqual({ label, shown: false });
    }
    expect(root.querySelector('h1')?.textContent).toBe('Teach the thesis-driven essay one step at a time.');
    // The Tutor panel, the grading panel, and What it will do / won’t.
    const panels = [...root.querySelectorAll('[data-guide-panel]')].map((panel) => panel.querySelector('h2')?.textContent);
    expect(panels).toEqual([
      'How the Tutor works with students',
      'Students submit, and the Grading Assistant helps you grade',
      'What it will do, and what it won’t',
    ]);
    // Inside the accent panels every block of text sits on a white card: the
    // two Tutor clip rows and three points, the grading clip row and three
    // points, and the two will/won’t cards. Dark text on the green would not read.
    expect(root.querySelectorAll('[data-guide-card]')).toHaveLength(11);
  });

  it('keeps the content, structure, clips, and screenshots', () => {
    const root = render();
    expect([...root.querySelectorAll('h2')].map((h) => h.textContent)).toEqual([
      'Essays that stand up in any high school or college classroom',
      'Teach it, step by step',
      'How the Tutor works with students',
      'Students submit, and the Grading Assistant helps you grade',
      'Use the thesis-driven essay to track student progress',
      'What it will do, and what it won’t',
    ]);
    expect(root.querySelectorAll('video')).toHaveLength(7);
    expect(root.querySelector('img[src="/img/thesis-essay-guide/hero.jpg"]')).not.toBeNull();
    expect(root.textContent).toContain('The Thesis-Driven Essay course');
    expect(root.textContent).toContain('cardinal rule');
    expect([...root.querySelectorAll('[data-guide-step]')].map((s) => s.textContent)).toEqual(['1', '2', '3', '1', '2']);
    const course = [...root.querySelectorAll('a')].find((a) => a.textContent === 'Open the course')!;
    expect(course.className.split(/\s+/)).toContain('text-[#1A1F2E]');
    expect(course.className.split(/\s+/)).toContain('underline');
  });

  it('copy: no punchy one-liners and no “this isn’t X, it’s Y”', () => {
    const text = render().textContent ?? '';
    expect(text).not.toContain('This isn’t an online course');
    expect(text).toContain('You teach the thesis-driven essay one step at a time, and the Tutor reinforces what you taught.');
    expect(text).not.toContain('The refusal is the point');
    expect(text).toContain('When a student asks it to write for them');
    expect(text).not.toContain('Every grade is yours.');
    expect(text).toContain('decide when students see it, so every grade is yours.');
    expect(text).not.toContain('The final grade. Students');
    expect(text).toContain('The final grade is yours to give.');
    expect(text).not.toMatch(/\bisn’t\s+\w[^.]*\.\s*It’s\b/);
  });
});
