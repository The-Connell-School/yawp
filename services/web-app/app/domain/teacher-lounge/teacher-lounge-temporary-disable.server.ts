import { redirect } from 'react-router';
import { isOnAccessList } from '~/domain/access-lists/access-lists.server';
import { TEACHER_LOUNGE_ACCESS_LIST_KEY } from '~/domain/access-lists/access-lists';
import {
  TEACHER_LOUNGE_FLAG,
  evaluateFeatureFlag,
  featureFlagSettingName,
  parseFeatureFlagValue,
} from '~/domain/feature-flags/feature-flags';
import { prisma } from '~/utils/db.server';
import { TEACHER_LOUNGE_DISABLED_HOME } from './teacher-lounge-temporary-disable';

async function isTeacherLoungeEnabledForOrg(
  orgId?: string | null
): Promise<boolean> {
  const row = await prisma.setting.findUnique({
    where: { name: featureFlagSettingName(TEACHER_LOUNGE_FLAG) },
    select: { value: true },
  });
  return evaluateFeatureFlag(parseFeatureFlagValue(row?.value), orgId);
}

export async function isTeacherLoungeTemporarilyDisabledForUser({
  userId,
  email,
  orgId,
}: {
  userId?: string | null;
  email?: string | null;
  orgId?: string | null;
}): Promise<boolean> {
  if (await isTeacherLoungeEnabledForOrg(orgId)) return false;
  if (
    await isOnAccessList(TEACHER_LOUNGE_ACCESS_LIST_KEY, {
      userId,
      email,
    })
  ) {
    return false;
  }
  return true;
}

export async function redirectIfTeacherLoungeTemporarilyDisabled(input: {
  userId?: string | null;
  email?: string | null;
  orgId?: string | null;
}) {
  if (await isTeacherLoungeTemporarilyDisabledForUser(input)) {
    throw redirect(TEACHER_LOUNGE_DISABLED_HOME);
  }
}

/** Whether Lounge e2e should skip while the flag is not on for everyone. */
export async function isTeacherLoungeGloballyDisabledForE2e(): Promise<boolean> {
  const row = await prisma.setting.findUnique({
    where: { name: featureFlagSettingName(TEACHER_LOUNGE_FLAG) },
    select: { value: true },
  });
  return parseFeatureFlagValue(row?.value).mode !== 'everyone';
}
