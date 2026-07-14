import { describe, expect, test } from 'bun:test';
import {
  GRADING_REQUEST_DEADLINE_MS,
  GradingRequestDeadlineError,
  runWithGradingRequestDeadline,
} from './grading-request-deadline.server';

describe('grading request deadline', () => {
  test('keeps the application budget below the infrastructure hard timeout', () => {
    expect(GRADING_REQUEST_DEADLINE_MS).toBe(100_000);
    expect(GRADING_REQUEST_DEADLINE_MS).toBeLessThan(120_000);
  });

  test('rejects with a controlled error when the shared signal expires', async () => {
    const signal = AbortSignal.timeout(1);

    await expect(
      runWithGradingRequestDeadline(
        signal,
        () => new Promise<string>(() => undefined)
      )
    ).rejects.toBeInstanceOf(GradingRequestDeadlineError);
  });

  test('returns an operation result before the shared signal expires', async () => {
    const signal = AbortSignal.timeout(1_000);

    await expect(
      runWithGradingRequestDeadline(signal, async () => 'graded')
    ).resolves.toBe('graded');
  });
});
