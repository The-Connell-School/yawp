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

const { AboutExitTicket } = await import('./about-exit-ticket');
const {
  ABOUT_LEDE,
  DESIRED_RESPONSE_DETAIL,
  DESIRED_RESPONSE_LEAD,
  GOOD_TICKET_HEADING,
  SCORING_HEADING,
  SCORING_INTRO,
  SCORING_MODES,
  SCORING_SCALE_NOTE,
  TELL_US_BASIC_NO_NOTES_DETAIL,
  TELL_US_BASIC_NO_NOTES_LEAD,
  TELL_US_BLANK_IS_A_CHOICE,
  TELL_US_HEADING,
  TELL_US_INTRO,
  TUTOR_HEADING,
  TUTOR_NOTE,
  TWO_WAYS,
  TWO_WAYS_HEADING,
  TWO_WAYS_INTRO,
  WHAT_MAKES_A_GOOD_ONE,
} = await import('./content');
const { EXIT_TICKET_FOCUS_OPTIONS } = await import(
  '~/domain/assignment-types/exit-ticket'
);
const { EXIT_TICKET_SCORE_BANDS } = await import(
  '~/domain/assignment-types/exit-ticket-rubric'
);

const SECTION_HEADINGS = [
  TWO_WAYS_HEADING,
  TELL_US_HEADING,
  SCORING_HEADING,
  GOOD_TICKET_HEADING,
  TUTOR_HEADING,
];

let activeRoot: Root | null = null;

function render(element: ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(element);
  });
  return root;
}

afterEach(() => {
  if (activeRoot) {
    act(() => activeRoot?.unmount());
    activeRoot = null;
  }
  document.body.innerHTML = '';
});

function renderAbout() {
  activeRoot = render(<AboutExitTicket />);
  return document.body;
}

function triggerFor(heading: string) {
  const button = Array.from(document.body.querySelectorAll('button')).find(
    (node) => node.textContent?.includes(heading)
  );
  if (!button) throw new Error(`No section trigger for "${heading}"`);
  return button;
}

/** Opens a collapsed section the way a teacher does, and returns the body. */
function openSection(heading: string) {
  act(() => {
    triggerFor(heading).click();
  });
  return document.body;
}

describe('the exit ticket about section', () => {
  it('opens with the blurb and nothing else expanded', () => {
    const body = renderAbout();

    // The one thing a teacher who has never seen the type needs, and the only
    // thing that used to be readable without scrolling past everything else.
    expect(body.textContent).toContain(ABOUT_LEDE);
    for (const heading of SECTION_HEADINGS) {
      expect(body.textContent).toContain(heading);
      expect(triggerFor(heading).getAttribute('data-state')).toBe('closed');
    }
    for (const body_text of [
      TWO_WAYS_INTRO,
      TELL_US_INTRO,
      SCORING_INTRO,
      TUTOR_NOTE,
    ]) {
      expect(body.textContent).not.toContain(body_text);
    }
  });

  it('gives every section a heading a teacher can click', () => {
    renderAbout();

    for (const heading of SECTION_HEADINGS) {
      const button = triggerFor(heading);
      // Radix wraps the trigger in a heading, so the sections are navigable by
      // heading and not only by button.
      expect(button.closest('h3')).not.toBeNull();
      expect(button.getAttribute('aria-expanded')).toBe('false');
    }
  });

  it('lets a teacher open more than one section at a time', () => {
    renderAbout();
    openSection(SCORING_HEADING);
    openSection(TWO_WAYS_HEADING);

    // The scale and the form's questions get compared, not browsed one at a
    // time, so opening the second must not close the first.
    expect(triggerFor(SCORING_HEADING).getAttribute('data-state')).toBe('open');
    expect(triggerFor(TWO_WAYS_HEADING).getAttribute('data-state')).toBe(
      'open'
    );
  });

  it('opens both shapes without asking the teacher to write a prompt', () => {
    renderAbout();
    const body = openSection(TWO_WAYS_HEADING);

    expect(body.textContent).toContain(TWO_WAYS_INTRO);
    for (const way of TWO_WAYS) {
      expect(body.textContent).toContain(way.mode);
      expect(body.textContent).toContain(way.detail);
    }
  });

  it('lists every focus a specific ticket can check for', () => {
    // Driven off the same options the form renders, so a new focus cannot be
    // added without this page describing it.
    renderAbout();
    const body = openSection(TWO_WAYS_HEADING);

    for (const option of EXIT_TICKET_FOCUS_OPTIONS) {
      expect(body.textContent?.toLowerCase()).toContain(
        option.label.toLowerCase()
      );
    }
  });

  it('explains the desired-response question and why it has no default', () => {
    renderAbout();
    const body = openSection(TWO_WAYS_HEADING);

    expect(body.textContent).toContain(DESIRED_RESPONSE_LEAD);
    expect(body.textContent).toContain(DESIRED_RESPONSE_DETAIL);
  });

  it('makes the case that more detail means a more targeted ticket', () => {
    renderAbout();
    const body = openSection(TELL_US_HEADING);

    expect(body.textContent).toContain(TELL_US_INTRO);
    // And is honest that a vague ticket is a legitimate choice.
    expect(body.textContent).toContain(TELL_US_BLANK_IS_A_CHOICE);
  });

  it('tells teachers the notes stay with them', () => {
    renderAbout();
    const body = openSection(TELL_US_HEADING);

    expect(body.textContent?.toLowerCase()).toContain('students never see');
  });

  it('names the basic-with-no-notes case as deliberate, not a default', () => {
    // The weakest configuration for reading responses, and the one a teacher
    // lands in by doing nothing. It has a real use, so it is framed as a
    // choice to make on purpose rather than as a mistake.
    renderAbout();
    const body = openSection(TELL_US_HEADING);

    expect(body.textContent).toContain(TELL_US_BASIC_NO_NOTES_LEAD);
    expect(body.textContent).toContain(TELL_US_BASIC_NO_NOTES_DETAIL);
  });

  it('says every response is scored and that counting it is the teacher choice', () => {
    renderAbout();
    const body = openSection(SCORING_HEADING);

    expect(body.textContent).toContain(SCORING_INTRO);
    for (const mode of SCORING_MODES) {
      expect(body.textContent).toContain(mode.label);
      expect(body.textContent).toContain(mode.detail);
    }
    expect(body.textContent?.toLowerCase()).toContain('gradebook');
  });

  it('shows the whole scale a response is scored against', () => {
    // Driven off the bands the grader is actually given, so the page cannot
    // describe a scale the model is not working from.
    renderAbout();
    const body = openSection(SCORING_HEADING);

    for (const band of EXIT_TICKET_SCORE_BANDS) {
      expect(body.textContent).toContain(band.label);
      expect(body.textContent).toContain(band.description);
    }
  });

  it('names the two scoring calls that surprise people', () => {
    renderAbout();
    const body = openSection(SCORING_HEADING);

    expect(body.textContent).toContain(SCORING_SCALE_NOTE);
    expect(body.textContent?.toLowerCase()).toContain('under half credit');
  });

  it('does not claim responses are left unscored', () => {
    // Every response is scored 0-100 against the understanding bands, whether
    // or not the score is recorded as a grade. The page used to say nothing
    // was auto-scored, which was simply false.
    renderAbout();
    const body = openSection(SCORING_HEADING);

    expect(body.textContent?.toLowerCase()).not.toContain(
      'nothing is auto-scored'
    );
  });

  it('opens what makes a good one', () => {
    renderAbout();
    const body = openSection(GOOD_TICKET_HEADING);

    for (const item of WHAT_MAKES_A_GOOD_ONE) {
      expect(body.textContent).toContain(item.title);
      expect(body.textContent).toContain(item.detail);
    }
  });

  it('explains why the tutor starts off', () => {
    renderAbout();
    const body = openSection(TUTOR_HEADING);

    expect(body.textContent).toContain(TUTOR_NOTE);
  });
});
