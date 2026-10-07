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
  TUTOR_BEHAVIOUR,
  TUTOR_HEADING,
  TUTOR_NOTE,
  TUTOR_TRADE,
  TUTOR_WHY_ON,
  TUTOR_WHY_ON_LEAD,
  TWO_WAYS,
  TWO_WAYS_HEADING,
  TWO_WAYS_INTRO,
  WHAT_MAKES_A_GOOD_ONE,
  QUICK_BUILDER_COPY,
} = await import('./content');
const { EXIT_TICKET_FOCUS_OPTIONS, EXIT_TICKET_REFLECTION_PROMPT_OPTIONS } =
  await import('~/domain/assignment-types/exit-ticket');
const { EXIT_TICKET_SCORE_BANDS } =
  await import('~/domain/assignment-types/exit-ticket-rubric');

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
  it('describes reflection and check rather than basic and specific', () => {
    renderAbout();
    const body = openSection(TWO_WAYS_HEADING);

    for (const way of QUICK_BUILDER_COPY.twoWays) {
      expect(body.textContent).toContain(way.mode);
      expect(body.textContent).toContain(way.detail);
    }
    expect(body.textContent).not.toContain(TWO_WAYS[0]!.detail);
  });

  it('lists the reflection questions the form offers', () => {
    renderAbout();
    const body = openSection(TWO_WAYS_HEADING);

    for (const option of EXIT_TICKET_REFLECTION_PROMPT_OPTIONS) {
      expect(body.textContent?.toLowerCase()).toContain(
        option.label.toLowerCase()
      );
    }
  });

  it('says grading is optional and asks for what it is graded on', () => {
    renderAbout();
    const body = openSection(SCORING_HEADING);

    expect(body.textContent).toContain(QUICK_BUILDER_COPY.scoringIntro);
    for (const mode of QUICK_BUILDER_COPY.scoringModes) {
      expect(body.textContent).toContain(mode.label);
      expect(body.textContent).toContain(mode.detail);
    }
    expect(body.textContent).not.toContain(SCORING_MODES[1]!.detail);
  });
});
