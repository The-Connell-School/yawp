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

const { ExitTicketDirections } = await import('./exit-ticket-directions');
const { EXIT_TICKET_FOCUS_OPTIONS } =
  await import('~/domain/assignment-types/exit-ticket');
const { EXIT_TICKET_SCORE_BANDS } =
  await import('~/domain/assignment-types/exit-ticket-rubric');

function text() {
  return (document.body.textContent ?? '').toLowerCase();
}

describe('ExitTicketDirections', () => {
  let root: Root | null = null;

  afterEach(() => {
    if (root) act(() => root!.unmount());
    root = null;
    document.body.innerHTML = '';
  });

  function render() {
    const container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => root!.render(<ExitTicketDirections />));
  }

  it('says what an exit ticket is for, and what it is not', () => {
    render();
    expect(text()).toContain('last five minutes');
    expect(text()).toContain('not a quiz');
    expect(text()).toContain('not a journal');
  });

  it('explains both shapes without asking the teacher to write a prompt', () => {
    render();
    expect(text()).toContain('basic');
    expect(text()).toContain('specific');
    expect(text()).toContain('you never write the prompt yourself');
  });

  it('lists every focus a specific ticket can check for', () => {
    // Driven off the same options the form renders, so a new focus cannot be
    // added without this page describing it.
    render();
    for (const option of EXIT_TICKET_FOCUS_OPTIONS) {
      expect(text()).toContain(option.label.toLowerCase());
    }
  });

  it('makes the case that more detail means a more targeted ticket', () => {
    render();
    expect(text()).toContain('the more you tell us, the more targeted');
    // And is honest that a vague ticket is a legitimate choice.
    expect(text()).toContain('a real choice, not a mistake');
    expect(text()).toContain('open-ended');
  });

  it('tells teachers the notes stay with them', () => {
    render();
    expect(text()).toContain('students never see');
  });

  it('explains why the tutor starts off', () => {
    render();
    expect(text()).toContain('tutor is switched off by default');
  });

  it('names the basic-with-no-notes case as deliberate, not a default', () => {
    render();
    // The weakest configuration for reading responses, and the one a teacher
    // lands in by doing nothing. It has a real use, so it is framed as a
    // choice to make on purpose rather than as a mistake.
    expect(text()).toContain(
      'a basic ticket with no notes is the hardest one to read well'
    );
    expect(text()).toContain('deliberately');
  });

  it('does not claim responses are left unscored', () => {
    // Every response is scored 0-100 against the understanding bands, whether
    // or not the score is recorded as a grade. The page used to say nothing
    // was auto-scored, which was simply false.
    render();
    expect(text()).not.toContain('nothing is auto-scored');
  });

  it('says every response is scored and that counting it is the teacher choice', () => {
    render();
    expect(text()).toContain('every response is scored');
    expect(text()).toContain('gradebook');
  });

  it('shows the whole scale a response is scored against', () => {
    // Driven off the bands the grader is actually given, so the page cannot
    // describe a scale the model is not working from.
    render();
    for (const band of EXIT_TICKET_SCORE_BANDS) {
      expect(text()).toContain(band.label.toLowerCase());
      expect(text()).toContain(band.description.toLowerCase());
    }
  });

  it('names the two scoring calls that surprise people', () => {
    render();
    expect(text()).toContain('under half credit');
  });
});
