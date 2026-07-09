import { describe, expect, test } from 'bun:test';

import {
  gradeActAnswer,
  isRenderableActQuestion,
  splitAroundUnderline,
  generatedActQuestionSchema,
} from './act-practice.shared';

const question = {
  id: 'q1',
  sentence: 'The museum, which opened in 1911 it houses ancient pottery.',
  underline: '1911 it houses',
  choices: [
    '1911 it houses',
    '1911, houses',
    '1911, houses,',
    '1911; it houses',
  ] as [string, string, string, string],
  correctChoiceIndex: 3,
  explanation:
    'A semicolon correctly joins the two independent clauses; the original is a comma splice/run-on.',
};

describe('gradeActAnswer', () => {
  test('marks the matching index correct and carries the explanation', () => {
    expect(gradeActAnswer(question, 3)).toEqual({
      correct: true,
      correctChoiceIndex: 3,
      explanation: question.explanation,
    });
  });

  test('marks a non-matching index incorrect', () => {
    expect(gradeActAnswer(question, 0).correct).toBe(false);
    expect(gradeActAnswer(question, 1).correct).toBe(false);
  });
});

describe('splitAroundUnderline', () => {
  test('splits the sentence around the underlined span', () => {
    expect(splitAroundUnderline(question.sentence, question.underline)).toEqual(
      {
        before: 'The museum, which opened in ',
        underlined: '1911 it houses',
        after: ' ancient pottery.',
      }
    );
  });

  test('returns the whole sentence unhighlighted when the span is absent', () => {
    expect(splitAroundUnderline('A plain sentence.', 'missing')).toEqual({
      before: 'A plain sentence.',
      underlined: '',
      after: '',
    });
  });
});

describe('isRenderableActQuestion', () => {
  test('accepts a well-formed question', () => {
    expect(isRenderableActQuestion(question)).toBe(true);
  });

  test('rejects a question whose underline is not in the sentence', () => {
    expect(
      isRenderableActQuestion({ ...question, underline: 'not present' })
    ).toBe(false);
  });

  test('rejects an out-of-range answer index', () => {
    expect(
      isRenderableActQuestion({ ...question, correctChoiceIndex: 4 })
    ).toBe(false);
  });

  test('rejects a blank choice', () => {
    expect(
      isRenderableActQuestion({
        ...question,
        choices: ['a', 'b', '   ', 'd'] as [string, string, string, string],
      })
    ).toBe(false);
  });
});

describe('generatedActQuestionSchema', () => {
  test('accepts a valid generated question', () => {
    const { id: _id, ...generated } = question;
    expect(generatedActQuestionSchema.safeParse(generated).success).toBe(true);
  });

  test('rejects the wrong number of choices', () => {
    const { id: _id, ...generated } = question;
    expect(
      generatedActQuestionSchema.safeParse({
        ...generated,
        choices: ['a', 'b', 'c'],
      }).success
    ).toBe(false);
  });
});
