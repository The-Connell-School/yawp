import { describe, expect, mock, test } from 'bun:test';

import {
  DAILY_PAGES_SHORT_FORM_STEP_TUTOR_INSTRUCTIONS,
  DAILY_PAGES_SHORT_FORM_TUTOR_INSTRUCTIONS,
} from '~/domain/assignment-types/daily-pages-short-form-rubric';

import {
  buildDailyPagesTutorSystemPrompt,
  formatTutorEvaluationReport,
  runDailyPagesTutorEvaluation,
  runTutorReplyChecks,
} from './daily-pages-tutor-evaluation.server';
import {
  dailyPagesTutorEvaluationV1,
  type TutorEvaluationCase,
} from './daily-pages-tutor-evaluation.v1';

const analyzeCase = dailyPagesTutorEvaluationV1.cases.find(
  (c) => c.id === 'analyze-quote-no-analysis'
)!;
const followUp = dailyPagesTutorEvaluationV1.cases.find(
  (c) => c.id === 'analyze-analysis-added'
)!;

const GOOD_REPLY =
  'You found the exact line where it turns. What does the word "but" do to the problem Juliet is describing?';

function fakeExecute(reply = GOOD_REPLY, verdict = { passed: true, evidence: 'Asks what "but" does.' }) {
  return mock(async ({ purpose }: { purpose: string }) =>
    purpose === 'tutor' ? reply : JSON.stringify(verdict)
  );
}

/**
 * The tutor under test is the one students get: the Daily Pages module text,
 * its step, the paragraph type's coaching and the rubric guidance, in the
 * order the route joins them.
 */
describe('buildDailyPagesTutorSystemPrompt', () => {
  test('stacks the module, the step, the paragraph type and the rubric guidance', () => {
    const system = buildDailyPagesTutorSystemPrompt(analyzeCase);

    const module = system.indexOf(DAILY_PAGES_SHORT_FORM_TUTOR_INSTRUCTIONS.slice(0, 40));
    const step = system.indexOf(DAILY_PAGES_SHORT_FORM_STEP_TUTOR_INSTRUCTIONS.slice(0, 40));
    const type = system.indexOf('PARAGRAPH TYPE: Analyze');
    const rubric = system.indexOf('Module rubric guidance');
    expect(module).toBeGreaterThanOrEqual(0);
    expect(step).toBeGreaterThan(module);
    expect(type).toBeGreaterThan(step);
    expect(rubric).toBeGreaterThan(type);
    expect(system).toContain('Depth of Thought');
  });

  test('adds no paragraph-type layer when the case has none', () => {
    const system = buildDailyPagesTutorSystemPrompt({
      ...analyzeCase,
      paragraphMode: null,
    });
    expect(system).not.toContain('PARAGRAPH TYPE');
  });
});

describe('runTutorReplyChecks', () => {
  const base: TutorEvaluationCase = { ...analyzeCase };

  test('passes a brief reply with one question', () => {
    const checks = runTutorReplyChecks(base, GOOD_REPLY);
    expect(checks.every((check) => check.status === 'pass')).toBe(true);
  });

  test('flags a reply too long to read in a sidebar', () => {
    const long = Array.from({ length: 160 }, () => 'word').join(' ') + '?';
    expect(runTutorReplyChecks(base, long)).toContainEqual(
      expect.objectContaining({ id: 'brief', status: 'fail' })
    );
  });

  test('flags a list of questions', () => {
    const reply = 'What is your claim? Which line shows it? How? Why does it matter?';
    expect(runTutorReplyChecks(base, reply)).toContainEqual(
      expect.objectContaining({ id: 'one-question', status: 'fail' })
    );
  });

  test('flags gushing praise', () => {
    expect(
      runTutorReplyChecks(base, 'This is amazing! What does "but" do?')
    ).toContainEqual(expect.objectContaining({ id: 'no-gushing', status: 'fail' }));
  });

  test('flags telling a student to avoid "I"', () => {
    expect(
      runTutorReplyChecks(base, 'Try to avoid first person here. What is your claim?')
    ).toContainEqual(
      expect.objectContaining({ id: 'first-person-allowed', status: 'fail' })
    );
  });

  test('flags a reply that exposes the behind-the-scenes setup', () => {
    expect(
      runTutorReplyChecks(base, 'In the student_document_context you wrote a claim. What next?')
    ).toContainEqual(expect.objectContaining({ id: 'stays-in-role', status: 'fail' }));
  });

  test('flags an empty reply', () => {
    expect(runTutorReplyChecks(base, '  ')).toContainEqual(
      expect.objectContaining({ id: 'replied', status: 'fail' })
    );
  });
});

describe('runDailyPagesTutorEvaluation', () => {
  test('sends the tutor the history, the assignment, the draft and the message', async () => {
    const execute = fakeExecute();

    await runDailyPagesTutorEvaluation({
      suite: dailyPagesTutorEvaluationV1,
      caseIds: [followUp.id],
      execute,
    });

    const tutorCall = execute.mock.calls.find(
      ([input]: any[]) => input.purpose === 'tutor'
    )![0] as any;
    const contents = tutorCall.messages.map((m: { content: string }) => m.content);
    expect(contents).toContain(followUp.history[followUp.history.length - 1].content);
    expect(contents.join('\n')).toContain('<assignment_prompt>');
    expect(contents.join('\n')).toContain(followUp.draft);
    expect(contents.at(-1)).toBe('Give me feedback');
    expect(tutorCall.system).toContain('PARAGRAPH TYPE: Analyze');
  });

  test('judges every criterion and keeps the judge’s evidence', async () => {
    const result = await runDailyPagesTutorEvaluation({
      suite: dailyPagesTutorEvaluationV1,
      caseIds: [analyzeCase.id],
      execute: fakeExecute(),
    });

    const run = result.cases[0].runs[0];
    expect(run.reply).toBe(GOOD_REPLY);
    expect(run.judged).toHaveLength(analyzeCase.criteria.length);
    expect(run.judged[0]).toMatchObject({ status: 'pass', evidence: 'Asks what "but" does.' });
    expect(result.status).toBe('pass');
  });

  test('fails the run when the judge fails a criterion', async () => {
    const result = await runDailyPagesTutorEvaluation({
      suite: dailyPagesTutorEvaluationV1,
      caseIds: [analyzeCase.id],
      execute: fakeExecute(GOOD_REPLY, { passed: false, evidence: 'Wrote the analysis.' }),
    });

    expect(result.cases[0].runs[0].status).toBe('fail');
    expect(result.status).toBe('fail');
  });

  test('marks a criterion for review when the judge returns nonsense', async () => {
    const execute = mock(async ({ purpose }: { purpose: string }) =>
      purpose === 'tutor' ? GOOD_REPLY : 'not json'
    );
    const result = await runDailyPagesTutorEvaluation({
      suite: dailyPagesTutorEvaluationV1,
      caseIds: [analyzeCase.id],
      execute,
    });

    expect(result.cases[0].runs[0].judged[0].status).toBe('needs_review');
  });

  test('records a failed tutor call instead of throwing', async () => {
    const execute = mock(async () => {
      throw new Error('model unavailable');
    });
    const result = await runDailyPagesTutorEvaluation({
      suite: dailyPagesTutorEvaluationV1,
      caseIds: [analyzeCase.id],
      execute,
    });

    expect(result.cases[0].runs[0].status).toBe('fail');
    expect(result.cases[0].runs[0].error).toContain('model unavailable');
  });

  /** The tutor runs warm, so one reply is a sample, not a verdict. */
  test('repeats each case and reports how many runs passed', async () => {
    let call = 0;
    const execute = mock(async ({ purpose }: { purpose: string }) => {
      if (purpose === 'tutor') return GOOD_REPLY;
      call += 1;
      return JSON.stringify({ passed: call > analyzeCase.criteria.length, evidence: 'x' });
    });
    const result = await runDailyPagesTutorEvaluation({
      suite: dailyPagesTutorEvaluationV1,
      caseIds: [analyzeCase.id],
      repeat: 2,
      execute,
    });

    expect(result.cases[0].runs).toHaveLength(2);
    expect(result.cases[0].passed).toBe(1);
  });
});

describe('formatTutorEvaluationReport', () => {
  test('prints each reply under its phase, with its checks', async () => {
    const result = await runDailyPagesTutorEvaluation({
      suite: dailyPagesTutorEvaluationV1,
      caseIds: [analyzeCase.id],
      execute: fakeExecute(),
    });
    const report = formatTutorEvaluationReport(dailyPagesTutorEvaluationV1, result);

    expect(report).toContain(analyzeCase.phase);
    expect(report).toContain(GOOD_REPLY);
    expect(report).toContain('PASS');
    expect(report).toContain('1/1 cases passed');
  });
});
