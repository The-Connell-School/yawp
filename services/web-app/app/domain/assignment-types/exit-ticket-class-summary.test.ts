import { describe, expect, test } from 'bun:test';
import {
  EXIT_TICKET_RETEACH_LABELS,
  EXIT_TICKET_SUMMARY_MAX_RESPONSES,
  EXIT_TICKET_SUMMARY_MIN_RESPONSES,
  EXIT_TICKET_SUMMARY_RESPONSE_MAX_CHARS,
  buildExitTicketSummaryPrompt,
  exitTicketSummaryFingerprint,
  exitTicketSummaryFixture,
  exitTicketSummarySeedLines,
  exitTicketSummaryTexts,
  readExitTicketClassSummary,
} from './exit-ticket-class-summary';
import type { ExitTicketConfig } from './exit-ticket';

const CONFIG: ExitTicketConfig = {
  schemaVersion: 1,
  mode: 'specific',
  kind: 'check',
  activity: 'answer-question',
  promptText: 'Who is Allie, and why does Holden keep thinking about him?',
  focus: 'explain-concept',
  topic: 'Who is Allie',
  answerType: 'subjective',
  lessonNotes: {
    mainPoints: '',
    mustMention: 'His younger brother, who died.',
    watchFor: 'Mixing Allie up with D.B.',
  },
};

const VALID = {
  understood: 'Most of the class knows Allie is Holden’s brother who died.',
  confusions: [
    { point: 'Several mix Allie up with D.B.', share: 'some' },
    { point: 'A few think Allie is a friend from school.', share: 'a few' },
  ],
  reteach: 'quick-review',
  reteachReason: 'The idea landed, but the brothers are getting mixed up.',
  nextLessonMove: {
    title: 'Sort the Caulfield family',
    minutes: 8,
    detail: 'Open with a quick family map: who is D.B., Allie, Phoebe.',
  },
};

describe('which responses the summary reads', () => {
  test('drops blanks, trims each, and caps length and count', () => {
    const texts = exitTicketSummaryTexts([
      { text: '  He is his brother.  ' },
      { text: '   ' },
      { text: null },
      { text: 'x'.repeat(EXIT_TICKET_SUMMARY_RESPONSE_MAX_CHARS + 50) },
      ...Array.from(
        { length: EXIT_TICKET_SUMMARY_MAX_RESPONSES + 5 },
        (_, i) => ({
          text: `answer ${i}`,
        })
      ),
    ]);
    expect(texts[0]).toBe('He is his brother.');
    expect(texts[1]!.length).toBeLessThanOrEqual(
      EXIT_TICKET_SUMMARY_RESPONSE_MAX_CHARS + 1
    );
    expect(texts).toHaveLength(EXIT_TICKET_SUMMARY_MAX_RESPONSES);
  });

  test('needs a few responses before there is a class to summarize', () => {
    expect(EXIT_TICKET_SUMMARY_MIN_RESPONSES).toBeGreaterThanOrEqual(3);
  });
});

describe('the fingerprint', () => {
  test('ignores order, so the same tickets read the same', () => {
    expect(exitTicketSummaryFingerprint(['a', 'b'])).toBe(
      exitTicketSummaryFingerprint(['b', 'a'])
    );
  });

  test('changes when a response arrives or changes', () => {
    const before = exitTicketSummaryFingerprint(['a', 'b']);
    expect(exitTicketSummaryFingerprint(['a', 'b', 'c'])).not.toBe(before);
    expect(exitTicketSummaryFingerprint(['a', 'B'])).not.toBe(before);
  });
});

describe('the prompt', () => {
  const { system, user } = buildExitTicketSummaryPrompt({
    assignmentTitle: 'Exit ticket: Allie',
    studentPrompt: 'Who is Allie, and why does Holden keep thinking about him?',
    config: CONFIG,
    texts: ['He is his brother who died.', 'Allie is D.B.', 'A kid at school?'],
    responseCount: 3,
  });

  test('asks for what landed, the confusion, and a reteach call, as JSON', () => {
    expect(system).toMatch(/understood/);
    expect(system).toMatch(/confusions/);
    expect(system).toMatch(/reteach/);
    expect(system).toMatch(/nextLessonMove/);
    expect(system).toMatch(/JSON/);
  });

  test('reads answers for meaning, not matching words', () => {
    expect(system).toMatch(/different words or spelling/);
  });

  test('names the activity in a few words', () => {
    expect(user).toContain('What the students were asked to do: Answer a question');
  });

  test('carries what the teacher wants Yawp! to know on a v3 ticket', () => {
    const withNote = buildExitTicketSummaryPrompt({
      assignmentTitle: 'Exit ticket: Allie',
      studentPrompt: 'Who is Allie?',
      config: {
        ...CONFIG,
        lessonNotes: { ...CONFIG.lessonNotes!, mainPoints: 'We read chapters 1 to 3.' },
      },
      texts: ['His brother.', 'His brother who died.', 'D.B.'],
      responseCount: 3,
    }).user;
    expect(withNote).toContain(
      'What the teacher wants Yawp! to know: We read chapters 1 to 3.'
    );
    expect(withNote).toContain('Correct answer: His younger brother, who died.');
  });

  test('carries the question, key points and mix-up, never a name', () => {
    expect(user).toContain('Who is Allie, and why does Holden');
    expect(user).toContain('His younger brother, who died.');
    expect(user).toContain('Mixing Allie up with D.B.');
    expect(user).toContain('1. He is his brother who died.');
    expect(system).toMatch(/never name/i);
  });
});

describe('reading the model’s answer', () => {
  test('accepts a well-formed summary', () => {
    expect(readExitTicketClassSummary(VALID)).toEqual(VALID as never);
  });

  test('drops a move when the call is to move on', () => {
    const summary = readExitTicketClassSummary({
      ...VALID,
      reteach: 'none',
    });
    expect(summary?.nextLessonMove).toBeNull();
  });

  test('keeps at most three confusions and only known shares', () => {
    const summary = readExitTicketClassSummary({
      ...VALID,
      confusions: [
        { point: 'one', share: 'most' },
        { point: 'two', share: 'a lot' },
        { point: 'three', share: 'some' },
        { point: 'four', share: 'a few' },
        { point: 'five', share: 'a few' },
      ],
    });
    expect(summary?.confusions.map((c) => c.point)).toEqual([
      'one',
      'three',
      'four',
    ]);
  });

  test('clamps the move to a short block', () => {
    const summary = readExitTicketClassSummary({
      ...VALID,
      nextLessonMove: { ...VALID.nextLessonMove, minutes: 45 },
    });
    expect(summary?.nextLessonMove?.minutes).toBe(15);
  });

  test('rejects anything missing what a teacher needs', () => {
    expect(readExitTicketClassSummary(null)).toBeNull();
    expect(readExitTicketClassSummary({ ...VALID, understood: '' })).toBeNull();
    expect(
      readExitTicketClassSummary({ ...VALID, reteach: 'maybe' })
    ).toBeNull();
  });
});

describe('labels, the fixture and the planner seed', () => {
  test('names each reteach call the way a teacher would', () => {
    expect(EXIT_TICKET_RETEACH_LABELS).toEqual({
      none: 'Move on',
      'quick-review': 'Quick review',
      reteach: 'Reteach',
    });
  });

  test('the fixture is a valid summary', () => {
    const fixture = exitTicketSummaryFixture(['a', 'b', 'c']);
    expect(readExitTicketClassSummary(fixture)).toEqual(fixture);
  });

  test('the seed carries the call and the suggested opening move', () => {
    const lines = exitTicketSummarySeedLines(
      readExitTicketClassSummary(VALID)!
    );
    const text = lines.join('\n');
    expect(text).toContain(VALID.understood);
    expect(text).toContain('Several mix Allie up with D.B.');
    expect(text).toContain('Quick review');
    expect(text).toContain('Sort the Caulfield family (8 min)');
  });
});
