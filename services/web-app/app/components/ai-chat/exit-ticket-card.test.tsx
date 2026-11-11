import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { ExitTicketCard } from './exit-ticket-card';
import { readPlannedExitTickets } from '~/domain/lesson-planner/exit-ticket-block';
import { EXIT_TICKET_EXPLAIN_CLOSER } from '~/domain/assignment-types/exit-ticket-activities';

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

describe('ExitTicketCard: a v3 ticket shows mainly the prompt students see', () => {
  test('the question students answer is the first thing on the card, with its closing line', () => {
    const html = render(v3Check);
    expect(textOf(html, 'exit-ticket-question')).toBe(
      'Who is Allie in The Catcher in the Rye, and why does Holden keep thinking about him?'
    );
    expect(textOf(html, 'exit-ticket-closer')).toBe(EXIT_TICKET_EXPLAIN_CLOSER);
    // Nothing about the ticket comes before the prompt but its short tag.
    const question = html.indexOf('data-testid="exit-ticket-question"');
    expect(html.indexOf('data-testid="exit-ticket-notes"')).toBeGreaterThan(
      question
    );
  });

  test('names the activity in a few words, not the form’s full sentence', () => {
    const html = render(v3Check);
    expect(textOf(html, 'exit-ticket-activity')).toBe('Answer a question');
    expect(html).not.toContain('Have the students answer a question');
    // A v3 check dual-writes the legacy explain-concept focus; it must not
    // show as the wrong activity.
    expect(html).not.toContain('Explain a concept');
  });

  test('keeps the key points behind a disclosure, closed', () => {
    const html = render(v3Check);
    expect(html).toMatch(/<details[^>]*data-testid="exit-ticket-notes"/);
    expect(html).not.toMatch(/<details[^>]*open/);
    expect(textOf(html, 'exit-ticket-notes')).toContain(
      'Allie is Holden’s younger brother'
    );
    expect(textOf(html, 'exit-ticket-notes')).toContain(
      'Students don’t see this'
    );
  });

  test('says nothing about grading when the ticket is ungraded', () => {
    const html = render(v3Check);
    expect(html).not.toContain('data-testid="exit-ticket-grading"');
    expect(html).not.toContain('Ungraded');
  });

  test('a graded ticket says so in one short line', () => {
    const html = render(`${v3Check}\ngraded: yes\npoints: 5`);
    expect(textOf(html, 'exit-ticket-grading')).toBe('Graded · 5 points');
  });

  test('a reflection with no key points has no disclosure at all', () => {
    const html = render(
      'activity: reflect\nstarter: wondering\npromptText: What is one question you still have about today’s lesson?'
    );
    expect(textOf(html, 'exit-ticket-activity')).toBe(
      'Reflect or ask a question'
    );
    expect(textOf(html, 'exit-ticket-question')).toBe(
      'What is one question you still have about today’s lesson?'
    );
    expect(html).not.toContain('data-testid="exit-ticket-notes"');
  });

  test('keeps the button that creates the ticket', () => {
    const html = render(v3Check);
    expect(html).toContain('data-testid="exit-ticket-create"');
    expect(html).toContain('exitTicketActivity=answer-question');
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
