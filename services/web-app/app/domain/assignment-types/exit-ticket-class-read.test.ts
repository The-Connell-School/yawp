import { describe, expect, test } from 'bun:test';
import {
  buildExitTicketClassRead,
  buildExitTicketLessonSeed,
  extractOpenQuestions,
  type ExitTicketResponseInput,
} from './exit-ticket-class-read';
import { EXIT_TICKET_SCORE_BANDS } from './exit-ticket-rubric';

function response(
  studentName: string,
  score: number | null,
  text = ''
): ExitTicketResponseInput {
  return {
    studentName,
    text,
    rubricScores:
      score === null ? null : { understanding: { score, isAi: true } },
  };
}

describe('buildExitTicketClassRead', () => {
  const read = buildExitTicketClassRead({
    responses: [
      response('Ada', 92),
      response('Ben', 60),
      response('Cy', 30),
      response('Dee', 0),
      response('Eli', 70),
      response('Fay', null, 'Not read yet.'),
    ],
    config: {
      schemaVersion: 1,
      mode: 'specific',
      focus: 'explain-concept',
      topic: 'erosion',
      answerType: 'objective',
      lessonNotes: {
        mainPoints: '',
        mustMention: '',
        watchFor: 'Using the two words interchangeably.',
      },
    },
  });

  test('counts every response, and every one that has been read', () => {
    expect(read.responseCount).toBe(6);
    expect(read.readCount).toBe(5);
  });

  test('sorts the read ones into the real exit ticket bands, best first', () => {
    expect(read.bands.map((band) => band.label)).toEqual(
      EXIT_TICKET_SCORE_BANDS.map((band) => band.label).reverse()
    );
    expect(
      Object.fromEntries(read.bands.map((b) => [b.label, b.count]))
    ).toEqual({
      'Explains it': 1,
      'Partly there': 2,
      'Names it only': 1,
      'No evidence': 1,
    });
  });

  test('names who needs following up with, weakest first, and no one else', () => {
    expect(read.needsFollowUp).toEqual(['Dee', 'Cy']);
  });

  test('carries the mix-up the teacher said to watch for', () => {
    expect(read.watchFor).toBe('Using the two words interchangeably.');
  });

  test('is empty but well-formed with no responses', () => {
    const empty = buildExitTicketClassRead({ responses: [], config: null });
    expect(empty.responseCount).toBe(0);
    expect(empty.bands.every((band) => band.count === 0)).toBe(true);
    expect(empty.openQuestions).toEqual([]);
    expect(empty.needsFollowUp).toEqual([]);
    expect(empty.watchFor).toBeNull();
  });

  test('caps the follow-up list so it stays a short list', () => {
    const many = buildExitTicketClassRead({
      responses: Array.from({ length: 12 }, (_, i) => response(`S${i}`, 5)),
      config: null,
    });
    expect(many.needsFollowUp).toHaveLength(5);
  });
});

describe('extractOpenQuestions', () => {
  test('pulls the questions students asked, once each, in their words', () => {
    expect(
      extractOpenQuestions([
        'I get weathering. But why does erosion need water? I think it is gravity too.',
        'Why does erosion need water?',
        'Does wind count as erosion? idk',
        'ok?',
      ])
    ).toEqual([
      'But why does erosion need water?',
      'Does wind count as erosion?',
    ]);
  });

  test('stops at a handful', () => {
    const texts = Array.from(
      { length: 20 },
      (_, i) => `What happens to rock number ${i} after it breaks?`
    );
    expect(extractOpenQuestions(texts)).toHaveLength(8);
  });
});

describe('buildExitTicketLessonSeed', () => {
  test('hands the planner what the tickets said, without student names', () => {
    const read = buildExitTicketClassRead({
      responses: [
        response('Ada', 92),
        response('Dee', 10, 'What is the difference between them?'),
      ],
      config: null,
    });
    const seed = buildExitTicketLessonSeed({
      read,
      className: 'English 9',
      assignmentTitle: 'Exit ticket: erosion',
    });

    expect(seed.prompt).toInclude('English 9');
    expect(seed.prompt).toInclude('Exit ticket: erosion');
    expect(seed.prompt).toInclude('Explains it: 1');
    expect(seed.prompt).toInclude('What is the difference between them?');
    expect(seed.prompt).not.toInclude('Dee');
    expect(seed.context).toInclude('Exit ticket: erosion');
  });
});
