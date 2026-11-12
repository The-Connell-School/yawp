import {
  ASSIGNMENT_TYPE_LANDING_THESIS_ESSAY_FLAG,
  ASSIGNMENT_TYPE_LANDING_V2_FLAG,
  ASSIGNMENT_TYPE_LESSON_PLANS_FLAG,
} from '~/domain/feature-flags/feature-flags';
import { isFeatureFlagEnabled } from '~/domain/feature-flags/feature-flags.server';

export type AssignmentTypeLandingFlags = {
  /** Brian's teacher-facing landing pages, for every type but one. */
  v2: boolean;
  /** The Thesis-Driven Essay page. Demo only until its stacks and videos exist. */
  thesisEssay: boolean;
  /**
   * How to Teach It's "Lesson plan" links open ready-built stacks in the
   * teacher's Lesson Planner (Kevin, Nov 5). Off: the lesson plan PDFs.
   */
  lessonPlans: boolean;
};

/** Which of the new assignment-type landing pages are on for this school. */
export async function getAssignmentTypeLandingFlags(
  orgId: string | null | undefined
): Promise<AssignmentTypeLandingFlags> {
  const [v2, thesisEssay, lessonPlans] = await Promise.all([
    isFeatureFlagEnabled(ASSIGNMENT_TYPE_LANDING_V2_FLAG, orgId),
    isFeatureFlagEnabled(ASSIGNMENT_TYPE_LANDING_THESIS_ESSAY_FLAG, orgId),
    isFeatureFlagEnabled(ASSIGNMENT_TYPE_LESSON_PLANS_FLAG, orgId),
  ]);
  return { v2, thesisEssay: thesisEssay && v2, lessonPlans: lessonPlans && v2 };
}
