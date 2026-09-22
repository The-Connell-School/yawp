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

const { AboutDailyPages } = await import('./about-daily-pages');
const {
  ABOUT_LEDE,
  GRADING_SUMMARY,
  HOW_ITS_GRADED_HEADING,
  HOW_TO_USE,
  HOW_TO_USE_HEADING,
  PROMPT_REWRITES,
  REGISTER_NOTE,
  PROMPT_WARNINGS,
  WHAT_IT_IS,
  WHAT_IT_IS_HEADING,
  WHAT_IT_IS_NOT,
  WHAT_IT_IS_NOT_HEADING,
  WRITE_YOUR_OWN_HEADING,
} = await import('./content');
const { SHORT_FORM_LIBRARY_HEADING } =
  await import('../short-form-prompts-library/short-form-teacher-directions');
const { KIND_LABEL, KIND_ORDER, TEACHING_NOTES } =
  await import('../short-form-prompts-library/data');

const SECTION_HEADINGS = [
  WHAT_IT_IS_HEADING,
  WHAT_IT_IS_NOT_HEADING,
  HOW_ITS_GRADED_HEADING,
  HOW_TO_USE_HEADING,
  WRITE_YOUR_OWN_HEADING,
  SHORT_FORM_LIBRARY_HEADING,
];

function render(element: ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(element);
  });

  return { root };
}

let activeRoot: Root | null = null;

afterEach(() => {
  if (activeRoot) {
    act(() => activeRoot?.unmount());
    activeRoot = null;
  }
  document.body.innerHTML = '';
});

function renderAbout() {
  activeRoot = render(<AboutDailyPages />).root;
  return document.body;
}

function triggers() {
  return Array.from(document.body.querySelectorAll('button'));
}

function triggerFor(heading: string) {
  const button = triggers().find((node) => node.textContent?.includes(heading));
  if (!button) throw new Error(`No section trigger for "${heading}"`);
  return button;
}

/** Opens a collapsed section the way a teacher does, and returns the body. */
function openSection(heading: string) {
  const button = triggerFor(heading);
  act(() => {
    button.click();
  });
  return document.body;
}

describe('the Daily Pages about section', () => {
  it('opens with the blurb and nothing else expanded', () => {
    const body = renderAbout();

    expect(body.textContent).toContain(ABOUT_LEDE);
    // Every section is a closed dropdown: the headings are there to be picked
    // from, none of the bodies are.
    for (const heading of SECTION_HEADINGS) {
      expect(body.textContent).toContain(heading);
      expect(triggerFor(heading).getAttribute('data-state')).toBe('closed');
    }
    for (const item of [
      ...WHAT_IT_IS,
      ...HOW_TO_USE,
      ...PROMPT_WARNINGS,
      ...TEACHING_NOTES,
    ]) {
      expect(body.textContent).not.toContain(item);
    }
  });

  it('gives every section a heading a teacher can click', () => {
    renderAbout();

    for (const heading of SECTION_HEADINGS) {
      const button = triggerFor(heading);
      const header = button.closest('h3');
      // Radix wraps the trigger in a heading, so the sections are navigable
      // by heading and not only by button.
      expect(header).not.toBeNull();
      expect(button.getAttribute('aria-expanded')).toBe('false');
    }
  });

  it('opens what a Daily Pages entry is', () => {
    renderAbout();
    const body = openSection(WHAT_IT_IS_HEADING);

    for (const item of WHAT_IT_IS) {
      expect(body.textContent).toContain(item);
    }
    expect(triggerFor(WHAT_IT_IS_HEADING).getAttribute('data-state')).toBe(
      'open'
    );
  });

  it('opens what it is not, and what to reach for instead', () => {
    renderAbout();
    const body = openSection(WHAT_IT_IS_NOT_HEADING);

    for (const item of WHAT_IT_IS_NOT) {
      expect(body.textContent).toContain(item.claim);
    }
    // The Class Starter boundary is the one teachers get wrong.
    expect(body.textContent).toContain('Class Starter');
  });

  it('puts every rubric category in a table row with its weight', () => {
    renderAbout();
    const body = openSection(HOW_ITS_GRADED_HEADING);
    const rows = Array.from(body.querySelectorAll('tbody tr'));

    expect(rows).toHaveLength(GRADING_SUMMARY.length);
    for (const [index, row] of rows.entries()) {
      const summary = GRADING_SUMMARY[index];
      expect(row.textContent).toContain(summary.label);
      expect(row.textContent).toContain(`${summary.weightPercent}%`);
    }
  });

  it('answers first person where the scale is explained', () => {
    renderAbout();
    const body = openSection(HOW_ITS_GRADED_HEADING);

    // The two questions teachers ask first, answered next to the scale rather
    // than left to whatever the assistant associates with essays.
    expect(body.textContent).toContain(REGISTER_NOTE);
  });

  it('opens how to run it with a class', () => {
    renderAbout();
    const body = openSection(HOW_TO_USE_HEADING);

    for (const item of HOW_TO_USE) {
      expect(body.textContent).toContain(item);
    }
  });

  it('opens the prompt guidance, rewrites and failure signs together', () => {
    renderAbout();
    const body = openSection(WRITE_YOUR_OWN_HEADING);

    for (const rewrite of PROMPT_REWRITES) {
      expect(body.textContent).toContain(rewrite.before);
      expect(body.textContent).toContain(rewrite.after);
      expect(body.textContent).toContain(rewrite.why);
    }
    for (const warning of PROMPT_WARNINGS) {
      expect(body.textContent).toContain(warning);
    }
  });

  it('carries the library directions as its last section', () => {
    renderAbout();
    const body = openSection(SHORT_FORM_LIBRARY_HEADING);

    // The six kinds and the library's own notes, which used to sit in a
    // second card below this one.
    for (const kind of KIND_ORDER) {
      expect(body.textContent).toContain(KIND_LABEL[kind]);
    }
    for (const note of TEACHING_NOTES) {
      expect(body.textContent).toContain(note);
    }
    expect(SECTION_HEADINGS.at(-1)).toBe(SHORT_FORM_LIBRARY_HEADING);
  });

  it('keeps sections open independently, so two can be read side by side', () => {
    renderAbout();
    openSection(HOW_ITS_GRADED_HEADING);
    const body = openSection(WRITE_YOUR_OWN_HEADING);

    expect(triggerFor(HOW_ITS_GRADED_HEADING).getAttribute('data-state')).toBe(
      'open'
    );
    expect(body.textContent).toContain(GRADING_SUMMARY[0].label);
    expect(body.textContent).toContain(PROMPT_REWRITES[0].after);
  });

  it('closes a section again when its heading is clicked twice', () => {
    renderAbout();
    openSection(WHAT_IT_IS_HEADING);
    const body = openSection(WHAT_IT_IS_HEADING);

    expect(triggerFor(WHAT_IT_IS_HEADING).getAttribute('data-state')).toBe(
      'closed'
    );
    expect(body.textContent).not.toContain(WHAT_IT_IS[0]);
  });
});
