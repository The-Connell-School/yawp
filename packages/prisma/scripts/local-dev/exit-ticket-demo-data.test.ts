import { describe, expect, test } from 'bun:test';

import {
  EXIT_TICKET_FOCUS_OPTIONS,
  composeExitTicketPrompt,
  parseStoredExitTicketConfig,
} from '../../../../services/web-app/app/domain/assignment-types/exit-ticket.ts';
import { EXIT_TICKET_SCORE_BANDS } from '../../../../services/web-app/app/domain/assignment-types/exit-ticket-rubric.ts';
import { LOCAL_DEV_PERSONAS } from './dev-personas.ts';
import {
  EXIT_TICKET_DEMO_TICKETS,
  type DemoExitTicket,
} from './exit-ticket-demo-data.ts';

/**
 * The demo set exists so a teacher looking at a preview can see every shape an
 * exit ticket comes in without having to build one of each. That is only true
 * for as long as the set actually covers them, and a configuration is easy to
 * drop by accident — so the matrix is asserted here rather than trusted.
 */

function filledNoteFields(ticket: DemoExitTicket): string[] {
  const notes = ticket.config.lessonNotes;
  if (!notes) return [];
  return (['mainPoints', 'mustMention', 'watchFor'] as const).filter(
    (key) => notes[key].trim().length > 0
  );
}

const graded = EXIT_TICKET_DEMO_TICKETS.flatMap((ticket) =>
  ticket.responses.filter((response) => response.state === 'graded')
);

describe('exit ticket demo data', () => {
  test('covers both ways of writing a ticket', () => {
    const modes = new Set(
      EXIT_TICKET_DEMO_TICKETS.map((ticket) => ticket.config.mode)
    );
    expect(modes).toEqual(new Set(['basic', 'specific']));
  });

  test('covers every focus a specific ticket can check for', () => {
    const focuses = new Set(
      EXIT_TICKET_DEMO_TICKETS.flatMap((ticket) =>
        ticket.config.mode === 'specific' ? [ticket.config.focus] : []
      )
    );
    for (const option of EXIT_TICKET_FOCUS_OPTIONS) {
      expect(focuses).toContain(option.value);
    }
  });

  test('covers all three amounts of lesson notes', () => {
    const shapes = EXIT_TICKET_DEMO_TICKETS.map(
      (ticket) => filledNoteFields(ticket).length
    );
    // None at all, a partly-filled one, and the fully-specified case. The
    // middle is the one a real teacher lands in most often and the one most
    // likely to go missing from a demo set.
    expect(shapes).toContain(0);
    expect(shapes.some((count) => count > 0 && count < 3)).toBe(true);
    expect(shapes).toContain(3);
  });

  test('shows a basic ticket both with and without notes', () => {
    const basics = EXIT_TICKET_DEMO_TICKETS.filter(
      (ticket) => ticket.config.mode === 'basic'
    );
    expect(basics.some((ticket) => filledNoteFields(ticket).length === 0)).toBe(
      true
    );
    expect(basics.some((ticket) => filledNoteFields(ticket).length > 0)).toBe(
      true
    );
  });

  test('shows a specific ticket with no notes at all', () => {
    const bare = EXIT_TICKET_DEMO_TICKETS.filter(
      (ticket) =>
        ticket.config.mode === 'specific' &&
        filledNoteFields(ticket).length === 0
    );
    expect(bare.length).toBeGreaterThan(0);
  });

  test('answers the desired-response question both ways', () => {
    const answers = new Set(
      EXIT_TICKET_DEMO_TICKETS.flatMap((ticket) =>
        ticket.config.mode === 'specific' ? [ticket.config.answerType] : []
      )
    );
    expect(answers).toEqual(new Set(['objective', 'subjective']));
  });

  test('covers both grading choices, at more than one point value', () => {
    expect(
      EXIT_TICKET_DEMO_TICKETS.some((ticket) => ticket.submitForGrade)
    ).toBe(true);
    expect(
      EXIT_TICKET_DEMO_TICKETS.some((ticket) => !ticket.submitForGrade)
    ).toBe(true);

    const pointValues = new Set(
      EXIT_TICKET_DEMO_TICKETS.filter((ticket) => ticket.submitForGrade).map(
        (ticket) => ticket.pointValue
      )
    );
    expect(pointValues.size).toBeGreaterThan(1);

    // Feedback-only tickets record no point value at all.
    for (const ticket of EXIT_TICKET_DEMO_TICKETS) {
      if (!ticket.submitForGrade) expect(ticket.pointValue).toBeNull();
    }
  });

  test('shows the tutor turned on somewhere, since teachers can', () => {
    expect(EXIT_TICKET_DEMO_TICKETS.some((ticket) => ticket.tutorEnabled)).toBe(
      true
    );
    expect(
      EXIT_TICKET_DEMO_TICKETS.some((ticket) => !ticket.tutorEnabled)
    ).toBe(true);
  });

  test('lands a graded response in every band', () => {
    for (const band of EXIT_TICKET_SCORE_BANDS) {
      const inBand = graded.filter(
        (response) => response.score! >= band.min && response.score! <= band.max
      );
      expect(inBand.length).toBeGreaterThan(0);
    }
  });

  test('shows the states before a grade exists, not only after', () => {
    const states = new Set(
      EXIT_TICKET_DEMO_TICKETS.flatMap((ticket) =>
        ticket.responses.map((response) => response.state)
      )
    );
    expect(states).toEqual(new Set(['graded', 'submitted', 'draft']));
  });

  test('carries a grade exactly when the response is graded', () => {
    for (const ticket of EXIT_TICKET_DEMO_TICKETS) {
      for (const response of ticket.responses) {
        if (response.state === 'graded') {
          expect(typeof response.score).toBe('number');
          expect(response.letterGrade).toBeTruthy();
          expect(response.overallComment).toBeTruthy();
        } else {
          expect(response.score).toBeUndefined();
          expect(response.letterGrade).toBeUndefined();
        }
      }
    }
  });

  test('every config is one the product would accept back', () => {
    // The seed writes these straight to exitTicketConfigJson, so anything the
    // reader rejects would be a demo ticket the app cannot grade.
    for (const ticket of EXIT_TICKET_DEMO_TICKETS) {
      expect(parseStoredExitTicketConfig(ticket.config)).not.toBeNull();
      expect(composeExitTicketPrompt(ticket.config).length).toBeGreaterThan(0);
    }
  });

  test('says what each ticket is in the set to demonstrate', () => {
    for (const ticket of EXIT_TICKET_DEMO_TICKETS) {
      expect(ticket.demonstrates.length).toBeGreaterThan(0);
    }
    // Distinct titles, so the preview list is readable.
    const titles = new Set(EXIT_TICKET_DEMO_TICKETS.map((t) => t.title));
    expect(titles.size).toBe(EXIT_TICKET_DEMO_TICKETS.length);
  });

  test('addresses each student by the name the seed actually gives them', () => {
    // The comments are written to a named student, and the seed attaches them
    // to whichever persona the response names. Invent a name here and a
    // teacher clicking through the preview reads a comment addressed to
    // somebody who is not in the class.
    const firstNameOf = new Map(
      LOCAL_DEV_PERSONAS.map((persona) => [
        persona.key,
        persona.name.split(' ')[0]!,
      ])
    );

    for (const ticket of EXIT_TICKET_DEMO_TICKETS) {
      for (const response of ticket.responses) {
        if (response.state !== 'graded') continue;
        const expected = firstNameOf.get(response.personaKey);
        expect(expected).toBeTruthy();
        expect(response.overallComment).toStartWith(`${expected}, `);
      }
    }
  });
});
