import { prisma } from './db.server';

export const FEATURE_FLAGS = {
  DOCUMENT_SUBMISSION: 'document_submission_enabled',
  DOCUMENT_SUBMISSION_SCHOOL_IDS: 'document_submission_enabled_school_ids',
  ASSIGNMENTS_ENABLED_ORG_IDS: 'assignments_enabled_org_ids',
} as const;

export async function getFeatureFlag(name: string): Promise<boolean> {
  const setting = await prisma.setting.findUnique({
    where: { name },
    select: { value: true, valueType: true },
  });

  if (!setting || setting.valueType !== 'boolean') {
    return false;
  }

  return setting.value === 'true';
}

export function parseSettingIdList(value: string | null | undefined): Set<string> {
  return new Set(
    (value ?? '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
  );
}

export async function getSettingIdList(name: string): Promise<Set<string> | null> {
  const setting = await prisma.setting.findUnique({
    where: { name },
    select: { value: true, valueType: true },
  });

  if (!setting) return null;
  if (setting.valueType !== 'string' && setting.valueType !== 'arrayOfStrings') {
    return null;
  }

  return parseSettingIdList(setting.value);
}

export async function isDocumentSubmissionEnabledForSchool(
  schoolId: string | null | undefined
): Promise<boolean> {
  const globalEnabled = await getFeatureFlag(FEATURE_FLAGS.DOCUMENT_SUBMISSION);
  if (globalEnabled) return true;

  const enabledSchoolIds = await getSettingIdList(
    FEATURE_FLAGS.DOCUMENT_SUBMISSION_SCHOOL_IDS
  );
  if (enabledSchoolIds === null || !schoolId) return false;
  return enabledSchoolIds.has(schoolId);
}

export async function isDocumentSubmissionEnabledForSchools(
  schoolIds: Array<string | null | undefined>
): Promise<boolean> {
  const globalEnabled = await getFeatureFlag(FEATURE_FLAGS.DOCUMENT_SUBMISSION);
  if (globalEnabled) return true;

  const enabledSchoolIds = await getSettingIdList(
    FEATURE_FLAGS.DOCUMENT_SUBMISSION_SCHOOL_IDS
  );
  if (enabledSchoolIds === null) return false;

  const distinctSchoolIds = Array.from(
    new Set(schoolIds.filter((schoolId): schoolId is string => Boolean(schoolId)))
  );
  if (distinctSchoolIds.length === 0) return false;

  return distinctSchoolIds.every((schoolId) => enabledSchoolIds.has(schoolId));
}

export async function isAssignmentsEnabledForOrganization(
  organizationId: string | null | undefined
): Promise<boolean> {
  const enabledOrgIds = await getSettingIdList(
    FEATURE_FLAGS.ASSIGNMENTS_ENABLED_ORG_IDS
  );
  if (enabledOrgIds === null || !organizationId) return false;
  return enabledOrgIds.has(organizationId);
}
