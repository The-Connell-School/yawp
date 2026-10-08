import { describe, expect, test } from 'bun:test';
import {
  AiRateLimitError,
} from '~/utils/ai-admission.server';
import {
  PLANNER_REQUESTS_PER_HOUR_PER_ORG_BASE,
  PLANNER_REQUESTS_PER_HOUR_PER_TEACHER,
  buildLessonPlannerAdmissionPolicy,
  lessonPlannerRateLimitMessage,
} from './lesson-planner-admission.server';

describe('buildLessonPlannerAdmissionPolicy', () => {
  test('caps each teacher at 40 requests per hour', () => {
    const policy = buildLessonPlannerAdmissionPolicy(5);
    expect(policy.membershipLimit).toBe(PLANNER_REQUESTS_PER_HOUR_PER_TEACHER);
    expect(policy.membershipWindowMs).toBe(3_600_000);
  });

  test('scales the school cap with teacher seats', () => {
    expect(buildLessonPlannerAdmissionPolicy(5).organizationLimit).toBe(
      PLANNER_REQUESTS_PER_HOUR_PER_ORG_BASE
    );
    expect(buildLessonPlannerAdmissionPolicy(20).organizationLimit).toBe(160);
  });
});

describe('lessonPlannerRateLimitMessage', () => {
  test('names the teacher hourly cap and retry window', () => {
    const message = lessonPlannerRateLimitMessage(
      new AiRateLimitError(1_800, 'membership')
    );
    expect(message).toContain(String(PLANNER_REQUESTS_PER_HOUR_PER_TEACHER));
    expect(message).toContain('30 minutes');
  });

  test('explains a shared school limit separately', () => {
    const message = lessonPlannerRateLimitMessage(
      new AiRateLimitError(600, 'organization')
    );
    expect(message).toContain('shared lesson planner limit');
    expect(message).toContain('10 minutes');
  });
});
