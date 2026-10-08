import { describe, expect, it } from 'bun:test';
import {
  EXIT_TICKET_FENCE,
  exitTicketCreateHref,
  inlinePlannedExitTickets,
  readExitTicketPrefill,
  readPlannedExitTickets,
} from './exit-ticket-block';
import {
  BASIC_EXIT_TICKET_PROMPT,
  EXIT_TICKET_REFLECTION_PROMPT_OPTIONS,
} from '~/domain/assignment-types/exit-ticket';

function fenced(...lines: string[]) {
  return ['```' + EXIT_TICKET_FENCE, ...lines, '```'].join('\n');
}

function onlyTicket(...lines: string[]) {
  const { tickets } = readPlannedExitTickets(fenced(...lines));
  expect(tickets).toHaveLength(1);
  return tickets[0]!;
}

function roundTrip(...lines: string[]) {
  const href = exitTicketCreateHref('type-9', onlyTicket(...lines));
  return readExitTicketPrefill(new URL(href, 'https://yawp.test').searchParams);
}

const wondering = EXIT_TICKET_REFLECTION_PROMPT_OPTIONS.find(
  (option) => option.id === 'wondering'
)!;

describe('planned exit tickets in the quick builder’s terms', () => {
  it('reads a kind in place of a mode', () => {
    const reflection = onlyTicket('kind: reflection');
    expect(reflection.config).toMatchObject({
      mode: 'basic',
      kind: 'reflection',
    });
    expect(reflection.prompt).toStartWith(BASIC_EXIT_TICKET_PROMPT);

    const check = onlyTicket(
      'kind: check',
      'focus: explain-concept',
      'topic: erosion',
      'answer: objective'
    );
    expect(check.config).toMatchObject({ mode: 'specific', kind: 'check' });
  });

  it('reads a suggested reflection question, or the planner’s own', () => {
    expect(
      onlyTicket('kind: reflection', 'prompt: wondering').prompt
    ).toStartWith(wondering.prompt!);
    expect(
      onlyTicket(
        'kind: reflection',
        'prompt: custom',
        'promptText: What would you tell a friend who missed today?'
      ).prompt
    ).toStartWith('What would you tell a friend who missed today?');
  });

  it('is ungraded unless the block says otherwise', () => {
    const ticket = onlyTicket('kind: reflection');
    expect(ticket.graded).toBe(false);
    expect(ticket.pointValue).toBeNull();
    expect('grading' in ticket.config).toBe(false);
  });

  it('carries grading, points and criteria when the block grades it', () => {
    const ticket = onlyTicket(
      'kind: check',
      'focus: explain-concept',
      'topic: erosion',
      'answer: objective',
      'graded: yes',
      'points: 5',
      'mustMention: Whether the material moves.'
    );
    expect(ticket.graded).toBe(true);
    expect(ticket.pointValue).toBe(5);
    expect(ticket.config.grading).toEqual({ basis: 'bands' });

    const reflection = onlyTicket(
      'kind: reflection',
      'graded: true',
      'basis: completion',
      'minSentences: 3'
    );
    expect(reflection.config.grading).toEqual({
      basis: 'completion',
      minSentences: 3,
    });
    // No points named: the exit ticket default, not the product's 100.
    expect(reflection.pointValue).toBe(10);
  });

  it('accepts "quality" for the bands basis, as the form labels it', () => {
    const ticket = onlyTicket(
      'kind: reflection',
      'graded: yes',
      'basis: quality',
      'mainPoints: A theme makes a claim.'
    );
    expect(ticket.config.grading?.basis).toBe('bands');
  });

  it('keeps the ticket but drops grading the block could not back up', () => {
    // A graded check with no answer key is not something that can be graded.
    // The ticket is still worth handing over; the teacher can grade it once
    // they add the answer.
    const ticket = onlyTicket(
      'kind: check',
      'focus: explain-concept',
      'topic: erosion',
      'answer: objective',
      'graded: yes',
      'points: 5'
    );
    expect(ticket.graded).toBe(false);
    expect(ticket.pointValue).toBeNull();
    expect('grading' in ticket.config).toBe(false);
  });
});

describe('the create link for the quick builder', () => {
  it('round-trips a reflection question', () => {
    expect(roundTrip('kind: reflection', 'prompt: wondering')).toMatchObject({
      mode: 'basic',
      reflectionPrompt: { id: 'wondering' },
      graded: false,
      grading: null,
    });
    expect(
      roundTrip(
        'kind: reflection',
        'prompt: custom',
        'promptText: What surprised you?'
      )?.reflectionPrompt
    ).toEqual({ id: 'custom', text: 'What surprised you?' });
  });

  it('round-trips grading, points and criteria', () => {
    expect(
      roundTrip(
        'kind: check',
        'focus: understand-text',
        'topic: the second stanza',
        'answer: subjective',
        'graded: yes',
        'points: 4',
        'assessFor: Points to a specific line',
        'minWords: 40'
      )
    ).toMatchObject({
      mode: 'specific',
      graded: true,
      pointValue: 4,
      grading: {
        basis: 'bands',
        assessFor: 'Points to a specific line',
        minWords: 40,
      },
    });
  });

  it('ignores grading params it cannot read rather than guessing', () => {
    const params = new URLSearchParams({
      exitTicketMode: 'basic',
      exitTicketGraded: 'true',
      exitTicketPointValue: 'lots',
      exitTicketGradingBasis: 'steps',
    });
    expect(readExitTicketPrefill(params)).toMatchObject({
      graded: true,
      pointValue: null,
      grading: null,
    });
  });
});

describe('the printed packet', () => {
  it('prints the same words the assignment will ask', () => {
    const block = fenced(
      'kind: reflection',
      'prompt: custom',
      'promptText: What would you tell a friend who missed today?'
    );
    const ticket = onlyTicket(
      'kind: reflection',
      'prompt: custom',
      'promptText: What would you tell a friend who missed today?'
    );
    const printed = inlinePlannedExitTickets(block);
    for (const line of ticket.prompt.split('\n').filter(Boolean)) {
      expect(printed).toContain(line);
    }
  });
});
