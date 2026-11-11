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
  EXIT_TICKET_EXPLAIN_CLOSER,
  EXIT_TICKET_QUESTIONS_LINE,
  exitTicketStarterOption,
} from '~/domain/assignment-types/exit-ticket';

function fenced(body: string) {
  return ['```' + EXIT_TICKET_FENCE, body, '```'].join('\n');
}

describe('readPlannedExitTickets', () => {
  it('reads a basic ticket and composes the standard prompt', () => {
    const { tickets, body } = readPlannedExitTickets(
      [
        'Closing (4 min).',
        fenced('mode: basic'),
        'Collect on the way out.',
      ].join('\n\n')
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
    const content =
      'Just a lesson plan.\n\n```yawp-material\nkind: handout\n```';
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
      ['Closing.', fenced('mode: specific\nfocus: explain-concept')].join(
        '\n\n'
      )
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
      reflectionPrompt: null,
      graded: false,
      pointValue: null,
      grading: null,
    });
  });

  it('is null when the link is an ordinary one', () => {
    expect(
      readExitTicketPrefill(new URLSearchParams('?newPrompt=hi'))
    ).toBeNull();
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
      reflectionPrompt: null,
      graded: false,
      pointValue: null,
      grading: null,
    });
  });
});

describe('a v3 exit ticket block', () => {
  const QUESTION = 'Who is Allie, and why does Holden keep thinking about him?';

  it('reads an activity and the planner’s own prompt', () => {
    const { tickets } = readPlannedExitTickets(
      fenced(
        [
          'title: Exit ticket: Allie',
          'activity: answer-question',
          `promptText: ${QUESTION}`,
          'mustMention: His younger brother, who died.',
        ].join('\n')
      )
    );
    expect(tickets).toHaveLength(1);
    expect(tickets[0]!.config).toMatchObject({
      mode: 'specific',
      activity: 'answer-question',
      promptText: QUESTION,
      lessonNotes: { mustMention: 'His younger brother, who died.' },
    });
    // There is a correct answer: the planner gave it.
    expect(tickets[0]!.config).toMatchObject({ answerType: 'objective' });
    expect(tickets[0]!.prompt).toBe(QUESTION);
    expect(tickets[0]!.title).toBe('Exit ticket: Allie');
  });

  it('a fixed reflection needs only its name', () => {
    const { tickets } = readPlannedExitTickets(
      fenced(['activity: reflect', 'starter: learned'].join('\n'))
    );
    expect(tickets[0]!.prompt).toBe(
      `${exitTicketStarterOption('learned')!.prompt}\n\n${EXIT_TICKET_EXPLAIN_CLOSER}`
    );
  });

  it('“explain a concept” takes the concept', () => {
    const { tickets } = readPlannedExitTickets(
      fenced(['activity: explain-concept', 'topic: dramatic irony'].join('\n'))
    );
    expect(tickets[0]!.prompt).toBe(
      `In your own words, explain dramatic irony.\n\n${EXIT_TICKET_EXPLAIN_CLOSER}`
    );
  });

  it('reads `answer: yes` and `answer: no`', () => {
    for (const [answer, answerType] of [
      ['yes', 'objective'],
      ['no', 'subjective'],
    ] as const) {
      const { tickets } = readPlannedExitTickets(
        fenced(
          [
            'activity: engage-text',
            'promptText: Find the volta.',
            `answer: ${answer}`,
          ].join('\n')
        )
      );
      expect(tickets[0]!.config).toMatchObject({ answerType });
    }
  });

  it('a v3 block is never graded, even when it asks to be', () => {
    const { tickets } = readPlannedExitTickets(
      fenced(
        [
          'activity: engage-text',
          'promptText: Find the volta.',
          'graded: yes',
          'basis: quality',
          'points: 5',
        ].join('\n')
      )
    );
    expect(tickets).toHaveLength(1);
    expect(tickets[0]!.graded).toBe(false);
    expect(tickets[0]!.pointValue).toBeNull();
    expect(tickets[0]!.config.grading).toBeUndefined();
  });

  it('drops a block with an activity but no prompt', () => {
    const { tickets } = readPlannedExitTickets(
      fenced('activity: answer-question')
    );
    expect(tickets).toHaveLength(0);
  });

  it('carries the activity through the create link to the sheet', () => {
    const { tickets } = readPlannedExitTickets(
      fenced(
        [
          'activity: answer-question',
          `promptText: ${QUESTION}`,
          'answer: yes',
          'mustMention: His younger brother.',
        ].join('\n')
      )
    );
    const href = exitTicketCreateHref('type-1', tickets[0]!, 'conv-1');
    const prefill = readExitTicketPrefill(
      new URL(href, 'http://x').searchParams
    );
    expect(prefill?.config).toEqual(tickets[0]!.config);
    expect(prefill?.graded).toBe(false);
    // The legacy fields still ride along for the quick builder.
    expect(prefill?.mode).toBe('specific');
    expect(prefill?.lessonNotes?.mustMention).toBe('His younger brother.');
  });

  it('carries a concept through the create link', () => {
    const { tickets } = readPlannedExitTickets(
      fenced(['activity: explain-concept', 'topic: irony'].join('\n'))
    );
    const prefill = readExitTicketPrefill(
      new URL(exitTicketCreateHref('type-1', tickets[0]!), 'http://x')
        .searchParams
    );
    expect(prefill?.config).toEqual(tickets[0]!.config);
  });

  it('reads `questions: yes` and `context:` and carries them to the sheet', () => {
    const { tickets } = readPlannedExitTickets(
      fenced(
        [
          'activity: answer-question',
          `promptText: ${QUESTION}`,
          'questions: yes',
          'context: We read chapters 1 to 3 today.',
        ].join('\n')
      )
    );
    expect(tickets[0]!.config).toMatchObject({
      invitesQuestions: true,
      lessonNotes: { mainPoints: 'We read chapters 1 to 3 today.' },
    });
    expect(tickets[0]!.prompt).toBe(
      `${QUESTION}\n\n${EXIT_TICKET_QUESTIONS_LINE}`
    );
    const prefill = readExitTicketPrefill(
      new URL(exitTicketCreateHref('type-1', tickets[0]!), 'http://x')
        .searchParams
    );
    expect(prefill?.config).toEqual(tickets[0]!.config);
  });

  it('leaves the questions line off unless the block asks for it', () => {
    const { tickets } = readPlannedExitTickets(
      fenced(['activity: reflect', 'starter: learned', 'questions: no'].join('\n'))
    );
    expect(tickets[0]!.config.invitesQuestions).toBeUndefined();
    expect(tickets[0]!.prompt).not.toContain(EXIT_TICKET_QUESTIONS_LINE);
  });

  it('a printed ticket carries the questions line too', () => {
    expect(
      inlinePlannedExitTickets(
        fenced(['activity: reflect', 'starter: learned', 'questions: yes'].join('\n'))
      )
    ).toContain(EXIT_TICKET_QUESTIONS_LINE);
  });

  it('a legacy link has no v3 config', () => {
    const prefill = readExitTicketPrefill(
      new URLSearchParams({ exitTicketMode: 'basic' })
    );
    expect(prefill?.config ?? null).toBeNull();
  });
});
