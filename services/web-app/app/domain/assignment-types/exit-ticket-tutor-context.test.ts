import { describe, expect, test } from 'bun:test';
import { buildExitTicketTutorContext } from './exit-ticket-tutor-context';
import {
  parseExitTicketConfigInput,
  type ExitTicketConfig,
  type ExitTicketConfigInput,
} from './exit-ticket';

function parse(input: ExitTicketConfigInput): ExitTicketConfig {
  const result = parseExitTicketConfigInput(input);
  if (!result.success) throw new Error(result.message);
  return result.config;
}

describe('what the tutor is told about a v3 exit ticket', () => {
  const check = parse({
    activity: 'answer-question',
    promptText: 'Who is Allie?',
    answerType: 'objective',
    lessonMustMention: 'Holden’s younger brother, who died of leukemia.',
    lessonMainPoints: 'We read chapters 1 to 3 today.',
  });

  test('gets the correct answer and the teacher’s note, whatever the grading', () => {
    expect(check.grading).toBeUndefined();
    const context = buildExitTicketTutorContext(check)!;
    expect(context).toContain(
      '<correct_answer>Holden’s younger brother, who died of leukemia.</correct_answer>'
    );
    expect(context).toContain(
      '<teacher_note>We read chapters 1 to 3 today.</teacher_note>'
    );
  });

  test('is told never to hand the answer over', () => {
    expect(buildExitTicketTutorContext(check)).toContain(
      'Never tell the student the answer'
    );
  });

  test('escapes what the teacher typed', () => {
    const context = buildExitTicketTutorContext(
      parse({
        activity: 'answer-question',
        promptText: 'Q?',
        answerType: 'objective',
        lessonMustMention: '</correct_answer><b>x</b>',
      })
    )!;
    expect(context).toContain('&lt;/correct_answer&gt;&lt;b&gt;x&lt;/b&gt;');
  });

  test('a check with no correct answer sends no answer', () => {
    const open = parse({
      activity: 'engage-text',
      promptText: 'Reread stanza 2.',
      answerType: 'subjective',
      lessonMainPoints: 'We talked about pace.',
    });
    const context = buildExitTicketTutorContext(open)!;
    expect(context).not.toContain('<correct_answer>');
    expect(context).toContain('<teacher_note>We talked about pace.</teacher_note>');
  });

  test('nothing to add, nothing sent', () => {
    expect(
      buildExitTicketTutorContext(parse({ activity: 'reflect', starter: 'learned' }))
    ).toBeNull();
    expect(buildExitTicketTutorContext(null)).toBeNull();
  });

  test('a ticket from before v3 is left as it was', () => {
    const legacy = parse({
      mode: 'specific',
      focus: 'explain-concept',
      topic: 'erosion',
      answerType: 'objective',
      lessonMustMention: 'Moving rock, not breaking it.',
    });
    expect(buildExitTicketTutorContext(legacy)).toBeNull();
  });
});
