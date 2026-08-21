import { describe, expect, test } from 'bun:test';

import { getPracticeSelfCheck } from './practice-self-check';

const EXERCISE =
  'At this point in time the committee has the ability to review the proposal.';

function checkById(response: string, id: string) {
  const result = getPracticeSelfCheck(response, EXERCISE);
  const check = result.checks.find((entry) => entry.id === id);
  if (!check) throw new Error(`missing check: ${id}`);
  return check;
}

describe('getPracticeSelfCheck', () => {
  test('counts words in the response', () => {
    expect(
      getPracticeSelfCheck('The committee can review it.', EXERCISE).wordCount
    ).toBe(5);
    expect(getPracticeSelfCheck('   ', EXERCISE).wordCount).toBe(0);
  });

  test('flags a response that still matches the original sentence', () => {
    expect(checkById(EXERCISE, 'revised').status).toBe('review');
    expect(checkById(`  ${EXERCISE.toUpperCase()}  `, 'revised').status).toBe(
      'review'
    );
    expect(
      checkById('The committee can review the proposal.', 'revised').status
    ).toBe('ok');
  });

  test('flags an empty response as unrevised', () => {
    expect(checkById('', 'revised').status).toBe('review');
  });

  test('flags a response with no ending punctuation', () => {
    expect(checkById('The committee can review it', 'punctuation').status).toBe(
      'review'
    );
    expect(
      checkById('The committee can review it.', 'punctuation').status
    ).toBe('ok');
    expect(
      checkById('Can the committee review it?"', 'punctuation').status
    ).toBe('ok');
  });

  test('names the wordy phrases it found', () => {
    const check = checkById(
      'In order to proceed, the committee has the ability to review it.',
      'wordy-phrases'
    );

    expect(check.status).toBe('review');
    expect(check.label).toContain('has the ability to');
    expect(check.label).toContain('in order to');
  });

  test('passes the wordy-phrase check when none are present', () => {
    expect(
      checkById('The committee can review the proposal.', 'wordy-phrases')
        .status
    ).toBe('ok');
  });

  test('never claims a response is correct or ready for review', () => {
    const result = getPracticeSelfCheck('asdf asdf asdf.', EXERCISE);

    expect(result.checks.every((check) => check.status === 'ok')).toBe(true);
    expect(
      result.checks.some((check) => /grade|correct|ready/i.test(check.label))
    ).toBe(false);
  });
});
