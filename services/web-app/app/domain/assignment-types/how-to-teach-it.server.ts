import { HOW_TO_TEACH_IT_FLAG } from '~/domain/feature-flags/feature-flags';
import { isFeatureFlagEnabled } from '~/domain/feature-flags/feature-flags.server';

/** Whether teachers in this school see How to Teach It on assignment types. */
export async function isHowToTeachItEnabled(
  orgId?: string | null
): Promise<boolean> {
  return isFeatureFlagEnabled(HOW_TO_TEACH_IT_FLAG, orgId);
}
