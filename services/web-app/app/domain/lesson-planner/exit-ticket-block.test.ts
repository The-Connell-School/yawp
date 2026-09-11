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
  EXIT_TICKET_CONFIG_SCHEMA_VERSION,
  EXIT_TICKET_ELABORATION_NOTE,
} from '~/domain/assignment-types/exit-ticket';

function fenced(body: string) {
  return ['```' + EXIT_TICKET_FENCE, body, '```'].join('\n');
}

describe('readPlannedExitTickets', () => {
  it('reads a basic ticket and composes the standard prompt', () => {
    const { tickets, body } = readPlannedExitTickets(
      ['Closing (4 min).', fenced('mode: basic'), 'Collect on the way out.'].join(
        '\n\n'
      )
    );

    expect(tickets).toHaveLength(1);
    expect(tickets[0]!.config).toEqual({
      schemaVersion: EXIT_TICKET_CONFIG_SCHEMA_VERSION,
      mode: 'basic',
    });
    // The prompt is composed by the same function the creation sheet previews
    // with, so what the planner shows and what students get cannot drift.
    expect(tickets[0]!.prompt).toInclude(BASIC_EXIT_TICKET_PROMPT);
    expect(tickets[0]!.prompt).toInclude(EXIT_TICKET_ELABORATION_NOTE);
    expect(body).toBe('Closing (4 min).\n\nCollect on the way out.');
  });

  it('reads a specific ticket with its focus, topic and answer type', () => {
    const { tickets } = readPlannedExitTickets(
      fenced(
        [
          'mode: specific',
          'focus: explain-concept',
          'topic: the difference between weathering and erosion',
          'answer: objective',
        ].join('\n')
      )
    );

    expect(tickets[0]!.config).toEqual({
      schemaVersion: EXIT_TICKET_CONFIG_SCHEMA_VERSION,
      mode: 'specific',
      focus: 'explain-concept',
      topic: 'the difference between weathering and erosion',
      answerType: 'objective',
    });
    expect(tickets[0]!.prompt).toInclude(
      'the difference between weathering and erosion'
    );
  });

  it('carries the lesson notes the planner already knows', () => {
    // The planner wrote the objective and the misconception a minute ago.
    // Those are exactly the three boxes a teacher would otherwise retype.
    const { tickets } = readPlannedExitTickets(
      fenced(
        [
          'mode: specific',
          'focus: explain-concept',
          'topic: weathering and erosion',
          'answer: objective',
          'mainPoints: Weathering breaks rock down in place; erosion carries it away.',
          'mustMention: Whether the material moves.',
          'watchFor: Using the two words interchangeably.',
        ].join('\n')
      )
    );

    expect(tickets[0]!.config.lessonNotes).toEqual({
      mainPoints:
        'Weathering breaks rock down in place; erosion carries it away.',
      mustMention: 'Whether the material moves.',
      watchFor: 'Using the two words interchangeably.',
    });
    // None of it is for students.
    expect(tickets[0]!.prompt).not.toInclude('Whether the material moves');
  });

  it('drops a ticket it cannot build rather than guessing', () => {
    // A specific ticket with no topic would compose into a sentence with a
    // hole in it, and one with no answer type would let a student be told
    // they are wrong on a question that never had a right answer.
    const { tickets } = readPlannedExitTickets(
      [
        fenced('mode: specific\nfocus: explain-concept\nanswer: objective'),
        fenced('mode: specific\nfocus: explain-concept\ntopic: mitosis'),
        fenced('mode: specific\nfocus: invented-focus\ntopic: mitosis'),
      ].join('\n\n')
    );

    expect(tickets).toEqual([]);
  });

  it('ignores keys it does not know and tolerates blank lines', () => {
    const { tickets } = readPlannedExitTickets(
      fenced('\nmode: basic\nminutes: 4\n\n')
    );

    expect(tickets).toHaveLength(1);
    expect(tickets[0]!.config.mode).toBe('basic');
  });

  it('leaves a reply with no ticket in it untouched', () => {
    const content = 'Just a lesson plan.\n\n```yawp-material\nkind: handout\n```';
    const { tickets, body } = readPlannedExitTickets(content);

    expect(tickets).toEqual([]);
    expect(body).toBe(content);
  });
});

describe('inlinePlannedExitTickets', () => {
  it('prints the ticket as the words students read', () => {
    // The packet is a thing to print: there is no button to offer, but the
    // prompt is real lesson content and has to appear as prose.
    const printed = inlinePlannedExitTickets(
      ['Closing.', fenced('mode: basic')].join('\n\n')
    );

    expect(printed).not.toInclude(EXIT_TICKET_FENCE);
    expect(printed).toInclude('> ' + BASIC_EXIT_TICKET_PROMPT.split('\n')[0]);
  });

  it('drops a block it cannot build', () => {
    const printed = inlinePlannedExitTickets(
      ['Closing.', fenced('mode: specific\nfocus: explain-concept')].join('\n\n')
    );

    expect(printed.trim()).toBe('Closing.');
  });
});

describe('exitTicketCreateHref', () => {
  it('opens the exit ticket type with every answer already filled in', () => {
    const { tickets } = readPlannedExitTickets(
      fenced(
        [
          'mode: specific',
          'focus: understand-text',
          'topic: the second stanza',
          'answer: subjective',
          'mustMention: that the speaker changes their mind',
        ].join('\n')
      )
    );

    const href = exitTicketCreateHref('type-9', tickets[0]!, 'conv-1');
    const url = new URL(href, 'https://yawp.test');

    expect(url.pathname).toBe('/app/assignment-types/type-9');
    expect(url.searchParams.get('exitTicketMode')).toBe('specific');
    expect(url.searchParams.get('exitTicketFocus')).toBe('understand-text');
    expect(url.searchParams.get('exitTicketTopic')).toBe('the second stanza');
    expect(url.searchParams.get('exitTicketAnswerType')).toBe('subjective');
    expect(url.searchParams.get('exitTicketLessonMustMention')).toBe(
      'that the speaker changes their mind'
    );
    // The lesson travels with the teacher so they can get back to it.
    expect(url.searchParams.get('fromLesson')).toBe('conv-1');
  });

  it('sends nothing it does not have', () => {
    const { tickets } = readPlannedExitTickets(fenced('mode: basic'));
    const url = new URL(
      exitTicketCreateHref('type-9', tickets[0]!),
      'https://yawp.test'
    );

    expect(url.searchParams.get('exitTicketMode')).toBe('basic');
    expect(url.searchParams.has('exitTicketFocus')).toBe(false);
    expect(url.searchParams.has('exitTicketLessonMainPoints')).toBe(false);
    expect(url.searchParams.has('fromLesson')).toBe(false);
  });
});

describe('readExitTicketPrefill', () => {
  it('reads back exactly what the link carried', () => {
    const { tickets } = readPlannedExitTickets(
      fenced(
        [
          'mode: specific',
          'focus: ask-question',
          'topic: long division',
          'answer: subjective',
          'mainPoints: The remainder is what is left over.',
        ].join('\n')
      )
    );
    const href = exitTicketCreateHref('type-9', tickets[0]!);
    const params = new URL(href, 'https://yawp.test').searchParams;

    expect(readExitTicketPrefill(params)).toEqual({
      mode: 'specific',
      focus: 'ask-question',
      topic: 'long division',
      answerType: 'subjective',
      lessonNotes: {
        mainPoints: 'The remainder is what is left over.',
        mustMention: '',
        watchFor: '',
      },
    });
  });

  it('is null when the link is an ordinary one', () => {
    expect(readExitTicketPrefill(new URLSearchParams('?newPrompt=hi'))).toBeNull();
  });

  it('refuses a hand-edited focus rather than opening on a wrong one', () => {
    expect(
      readExitTicketPrefill(
        new URLSearchParams('exitTicketMode=specific&exitTicketFocus=whatever')
      )
    ).toBeNull();
  });

  it('keeps a specific ticket whose answer type was stripped', () => {
    // Losing the answer type leaves the question unanswered in the sheet,
    // which is what blocks submission until the teacher decides. It must not
    // throw away the topic they came here with.
    expect(
      readExitTicketPrefill(
        new URLSearchParams(
          'exitTicketMode=specific&exitTicketFocus=ask-question&exitTicketTopic=mitosis'
        )
      )
    ).toEqual({
      mode: 'specific',
      focus: 'ask-question',
      topic: 'mitosis',
      answerType: null,
      lessonNotes: null,
    });
  });
});
