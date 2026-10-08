import type { AiAdmissionPolicy } from '~/utils/ai-admission.server';
import { AiRateLimitError } from '~/utils/ai-admission.server';

/** Per-teacher hourly budget — enough for a full lesson with tool rounds. */
export const PLANNER_REQUESTS_PER_HOUR_PER_TEACHER = 40;
/** Reporter reference: 80/hr for a whole school at modest seat counts. */
export const PLANNER_REQUESTS_PER_HOUR_PER_ORG_BASE = 80;
/** Scale org cap with licensed teacher seats (8 requests/hr per seat). */
export const PLANNER_REQUESTS_PER_HOUR_PER_TEACHER_SEAT = 8;

export function buildLessonPlannerAdmissionPolicy(
  numOfTeacherSeats: number
): AiAdmissionPolicy {
  const seats = Math.max(1, numOfTeacherSeats);
  const organizationLimit = Math.max(
    PLANNER_REQUESTS_PER_HOUR_PER_ORG_BASE,
    seats * PLANNER_REQUESTS_PER_HOUR_PER_TEACHER_SEAT
  );
  return {
    membershipLimit: PLANNER_REQUESTS_PER_HOUR_PER_TEACHER,
    membershipWindowMs: 60 * 60_000,
    organizationLimit,
    organizationWindowMs: 60 * 60_000,
  };
}

export function lessonPlannerRateLimitMessage(error: AiRateLimitError): string {
  const minutes = Math.max(1, Math.ceil(error.retryAfterSeconds / 60));
  if (error.scope === 'organization') {
    return `Your school has reached its shared lesson planner limit for this hour. Try again in about ${minutes} minute${minutes === 1 ? '' : 's'}, or ask a colleague to wait if several teachers are planning at once.`;
  }
  return `You have reached your lesson planner limit for this hour (${PLANNER_REQUESTS_PER_HOUR_PER_TEACHER} requests). Try again in about ${minutes} minute${minutes === 1 ? '' : 's'}.`;
}
