import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { ExitTicketCard } from './exit-ticket-card';
import { readPlannedExitTickets } from '~/domain/lesson-planner/exit-ticket-block';
import {
  EXIT_TICKET_EXPLAIN_CLOSER,
  EXIT_TICKET_QUESTIONS_LINE,
} from '~/domain/assignment-types/exit-ticket-activities';

function ticketFrom(block: string) {
  const [ticket] = readPlannedExitTickets(
    '```yawp-exit-ticket\n' + block + '\n```'
  ).tickets;
  if (!ticket) throw new Error('block did not parse');
  return ticket;
}

function render(block: string) {
  return renderToStaticMarkup(
    <MemoryRouter>
      <ExitTicketCard ticket={ticketFrom(block)} assignmentTypeId="type_1" />
    </MemoryRouter>
  );
}

/** The text of an element by test id, tags stripped. */
function textOf(html: string, testId: string): string {
  const start = html.indexOf(`data-testid="${testId}"`);
  if (start < 0) return '';
  const open = html.lastIndexOf('<', start);
  const tag = /^<(\w+)/.exec(html.slice(open))![1];
  const end = html.indexOf(`</${tag}>`, start);
  return html.slice(html.indexOf('>', start) + 1, end).replace(/<[^>]+>/g, '');
}

const v3Check = [
  'activity: answer-question',
  'promptText: Who is Allie in The Catcher in the Rye, and why does Holden keep thinking about him?',
  'mustMention: Allie is Holden’s younger brother, who died of leukemia.',
  'watchFor: Mixing Allie up with D.B.',
].join('\n');

describe('ExitTicketCard: a v3 ticket shows only what students read', () => {
  test('the question students answer is the first thing on the card', () => {
    const html = render(v3Check);
    expect(textOf(html, 'exit-ticket-question')).toBe(
      'Who is Allie in The Catcher in the Rye, and why does Holden keep thinking about him?'
    );
    // A question gets no closing line.
    expect(html).not.toContain('data-testid="exit-ticket-closer"');
  });

  test('an explain ticket shows the closing line Yawp! adds', () => {
    const html = render('activity: explain-concept\ntopic: photosynthesis');
    expect(textOf(html, 'exit-ticket-question')).toBe(
      'In your own words, explain photosynthesis.'
    );
    expect(textOf(html, 'exit-ticket-closer')).toBe(EXIT_TICKET_EXPLAIN_CLOSER);
  });

  test('shows the questions line when the planner switched it on', () => {
    const html = render('activity: reflect\nstarter: learned\nquestions: yes');
    expect(textOf(html, 'exit-ticket-questions-line')).toBe(
      EXIT_TICKET_QUESTIONS_LINE
    );
    expect(render('activity: reflect\nstarter: learned')).not.toContain(
      'data-testid="exit-ticket-questions-line"'
    );
  });

  test('names the activity in a few words, not the form’s full sentence', () => {
    const html = render(v3Check);
    expect(textOf(html, 'exit-ticket-activity')).toBe('Answer a question');
    expect(html).not.toContain('Have students');
    // A v3 check dual-writes the legacy explain-concept focus; it must not
    // show as the wrong activity.
    expect(html).not.toContain('Explain a concept');
  });

  test('leaves the instructional notes off the card', () => {
    const html = render(v3Check);
    expect(html).not.toContain('data-testid="exit-ticket-notes"');
    expect(html).not.toContain('Allie is Holden’s younger brother');
    expect(html).not.toContain('Mixing Allie up with D.B.');
  });

  test('says nothing about grading, even when the block asked for it', () => {
    for (const block of [v3Check, `${v3Check}\ngraded: yes\npoints: 5`]) {
      const html = render(block);
      expect(html).not.toContain('data-testid="exit-ticket-grading"');
      expect(html).not.toContain('Ungraded');
    }
  });

  test('a reflection is tagged as one', () => {
    const html = render('activity: reflect\nstarter: wondering');
    expect(textOf(html, 'exit-ticket-activity')).toBe('Reflection');
    expect(textOf(html, 'exit-ticket-question')).toBe(
      'What is one question you still have about today’s lesson?'
    );
  });

  test('keeps the button that creates the ticket, carrying the answer', () => {
    const html = render(v3Check);
    expect(html).toContain('data-testid="exit-ticket-create"');
    expect(html).toContain('exitTicketActivity=answer-question');
    expect(html).toContain('exitTicketLessonMustMention=');
  });
});

describe('ExitTicketCard: a legacy ticket reads as before', () => {
  test('keeps its kind label, grading line and open notes', () => {
    const html = render(
      [
        'kind: check',
        'focus: explain-concept',
        'topic: the difference between weathering and erosion',
        'answer: objective',
        'mainPoints: Weathering breaks rock down in place.',
      ].join('\n')
    );
    expect(html).toContain('Ungraded — feedback only');
    expect(html).toContain('Weathering breaks rock down in place.');
    expect(html).not.toMatch(/<details[^>]*data-testid="exit-ticket-notes"/);
  });
});
