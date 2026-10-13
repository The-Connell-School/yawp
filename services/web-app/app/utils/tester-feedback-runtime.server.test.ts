import { describe, expect, mock, test } from 'bun:test';
import {
  saveTesterFeedback,
  testerFeedbackEnabled,
  testerFeedbackRuntimeAllowed,
  type FeedbackWriteTransaction,
} from './tester-feedback-runtime.server';
import type { FeedbackInput } from './tester-feedback.server';

const input: FeedbackInput = {
  userId: 'tester-1',
  url: '/app',
  userAgent: 'test',
  whatIDid: 'Opened',
  whatHappened: 'Froze',
  whatIWish: 'Save',
  severity: null,
  environment: 'demo',
};

describe('feedback database rate limit', () => {
  test('locks before counting and inserts below five in the last ten minutes', async () => {
    const order: string[] = [];
    const count = mock(async () => {
      order.push('count');
      return 4;
    });
    const create = mock(async () => {
      order.push('create');
      return {};
    });
    const lock = mock(async () => {
      order.push('lock');
      return 1;
    });
    const tx = {
      $executeRaw: lock,
      testerFeedback: { count, create },
    } as unknown as FeedbackWriteTransaction;
    expect(
      await saveTesterFeedback(input, async (operation) => operation(tx))
    ).toBe(true);
    expect(order).toEqual(['lock', 'count', 'create']);
    expect(create).toHaveBeenCalledWith({ data: input });
    expect(count).toHaveBeenCalledWith({
      where: { userId: 'tester-1', createdAt: { gte: expect.any(Date) } },
    });
  });
  test('does not insert at five submissions', async () => {
    const create = mock(async () => ({}));
    const tx = {
      $executeRaw: mock(async () => 1),
      testerFeedback: { count: mock(async () => 5), create },
    } as unknown as FeedbackWriteTransaction;
    expect(
      await saveTesterFeedback(input, async (operation) => operation(tx))
    ).toBe(false);
    expect(create).not.toHaveBeenCalled();
  });
});

describe('feedback runtime gate', () => {
  test('allows demo even under production runtime and denies production fallback', () => {
    expect(
      testerFeedbackRuntimeAllowed({
        PREVIEW_SLUG: 'demo',
        YAWP_ENVIRONMENT: 'production',
        NODE_ENV: 'production',
      })
    ).toBe(true);
    expect(
      testerFeedbackRuntimeAllowed({
        YAWP_ENVIRONMENT: 'production',
        NODE_ENV: 'production',
      })
    ).toBe(false);
    expect(testerFeedbackRuntimeAllowed({ NODE_ENV: 'production' })).toBe(
      false
    );
    expect(testerFeedbackRuntimeAllowed({ NODE_ENV: 'test' })).toBe(true);
  });
  test('enabled requires both the flag and a non-production runtime', () => {
    const savedFlag = process.env.TESTER_FEEDBACK_ENABLED;
    const savedPreviewSlug = process.env.PREVIEW_SLUG;
    const savedYawpEnvironment = process.env.YAWP_ENVIRONMENT;
    const savedNodeEnv = process.env.NODE_ENV;
    try {
      process.env.TESTER_FEEDBACK_ENABLED = 'true';
      delete process.env.PREVIEW_SLUG;
      process.env.YAWP_ENVIRONMENT = 'production';
      process.env.NODE_ENV = 'production';
      expect(testerFeedbackEnabled()).toBe(false);
      process.env.PREVIEW_SLUG = 'demo';
      expect(testerFeedbackEnabled()).toBe(true);
    } finally {
      if (savedFlag === undefined) delete process.env.TESTER_FEEDBACK_ENABLED;
      else process.env.TESTER_FEEDBACK_ENABLED = savedFlag;
      if (savedPreviewSlug === undefined) delete process.env.PREVIEW_SLUG;
      else process.env.PREVIEW_SLUG = savedPreviewSlug;
      if (savedYawpEnvironment === undefined)
        delete process.env.YAWP_ENVIRONMENT;
      else process.env.YAWP_ENVIRONMENT = savedYawpEnvironment;
      if (savedNodeEnv === undefined)
        Reflect.deleteProperty(process.env, 'NODE_ENV');
      else process.env.NODE_ENV = savedNodeEnv;
    }
  });
});
