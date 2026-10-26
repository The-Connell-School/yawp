import { data as dataResponse } from 'react-router';
import { TEACHER_PROMPT_GENERATOR_FLAG } from '~/domain/feature-flags/feature-flags';
import { isFeatureFlagEnabled } from '~/domain/feature-flags/feature-flags.server';

const DISABLED_MESSAGE =
  'The prompt generator is unavailable right now. Please try again.';

/** Whether the teacher prompt generator is on for this organization. */
export async function isTeacherPromptGeneratorEnabled(
  orgId?: string | null
): Promise<boolean> {
  return isFeatureFlagEnabled(TEACHER_PROMPT_GENERATOR_FLAG, orgId);
}

/**
 * Gate generator API routes. Returns a 404 JSON body when the flag is off so
 * prod stays dark until Internal turns the flag on.
 */
export async function teacherPromptGeneratorDisabledResponse(
  orgId?: string | null
) {
  if (await isTeacherPromptGeneratorEnabled(orgId)) return null;
  return dataResponse(
    { success: false, message: DISABLED_MESSAGE },
    { status: 404 }
  );
}
