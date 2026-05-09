import { prisma } from './db.server';

type TargetedFeatureFlagDefinition = {
  settingName: string;
  targetKind: 'organization' | 'school';
  description: string;
};

export const FEATURE_FLAGS = {
  DOCUMENT_SUBMISSION: 'document_submission_enabled',
  DOCUMENT_SUBMISSION_SCHOOL_IDS: 'document_submission_enabled_school_ids',
  ASSIGNMENTS_ENABLED_ORG_IDS: 'assignments_enabled_org_ids',
  RELEASED_GRADES_ORGANIZATION_ENABLED_ORG_IDS:
    'released_grades_organization_enabled_org_ids',
} as const;

export const TARGETED_FEATURE_FLAGS = {
  documentSubmission: {
    settingName: FEATURE_FLAGS.DOCUMENT_SUBMISSION_SCHOOL_IDS,
    targetKind: 'school',
    description: 'School IDs allowed to use document submission and grading',
  },
  assignments: {
    settingName: FEATURE_FLAGS.ASSIGNMENTS_ENABLED_ORG_IDS,
    targetKind: 'organization',
    description: 'Organization IDs allowed to use assignments',
  },
  releasedGradesOrganization: {
    settingName: FEATURE_FLAGS.RELEASED_GRADES_ORGANIZATION_ENABLED_ORG_IDS,
    targetKind: 'organization',
    description:
      'Organization IDs allowed to use released grades organization view',
  },
} as const satisfies Record<string, TargetedFeatureFlagDefinition>;

export type TargetedFeatureFlag = keyof typeof TARGETED_FEATURE_FLAGS;

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

export async function getTargetedFeatureFlagIds(
  flag: TargetedFeatureFlag
): Promise<Set<string>> {
  const enabledIds = await getSettingIdList(
    TARGETED_FEATURE_FLAGS[flag].settingName
  );
  return enabledIds ?? new Set();
}

export async function isTargetedFeatureFlagEnabled(
  flag: TargetedFeatureFlag,
  targetId: string | null | undefined
): Promise<boolean> {
  if (!targetId) return false;

  const enabledIds = await getTargetedFeatureFlagIds(flag);
  return enabledIds.has(targetId);
}

export async function setTargetedFeatureFlagTarget(
  flag: TargetedFeatureFlag,
  targetId: string,
  enabled: boolean
): Promise<string> {
  const definition = TARGETED_FEATURE_FLAGS[flag];
  const enabledIds = await getTargetedFeatureFlagIds(flag);

  if (enabled) {
    enabledIds.add(targetId);
  } else {
    enabledIds.delete(targetId);
  }

  const value = Array.from(enabledIds).join(',');
  await prisma.setting.upsert({
    where: { name: definition.settingName },
    create: {
      name: definition.settingName,
      description: definition.description,
      value,
      valueType: 'string',
    },
    update: {
      description: definition.description,
      value,
      valueType: 'string',
    },
  });

  return value;
}

export async function isDocumentSubmissionEnabledForSchool(
  schoolId: string | null | undefined
): Promise<boolean> {
  const globalEnabled = await getFeatureFlag(FEATURE_FLAGS.DOCUMENT_SUBMISSION);
  if (globalEnabled) return true;

  return isTargetedFeatureFlagEnabled('documentSubmission', schoolId);
}

export async function isDocumentSubmissionEnabledForSchools(
  schoolIds: Array<string | null | undefined>
): Promise<boolean> {
  const globalEnabled = await getFeatureFlag(FEATURE_FLAGS.DOCUMENT_SUBMISSION);
  if (globalEnabled) return true;

  const enabledSchoolIds = await getTargetedFeatureFlagIds('documentSubmission');

  const distinctSchoolIds = Array.from(
    new Set(schoolIds.filter((schoolId): schoolId is string => Boolean(schoolId)))
  );
  if (distinctSchoolIds.length === 0) return false;

  return distinctSchoolIds.every((schoolId) => enabledSchoolIds.has(schoolId));
}

export async function isAssignmentsEnabledForOrganization(
  organizationId: string | null | undefined
): Promise<boolean> {
  return isTargetedFeatureFlagEnabled('assignments', organizationId);
}

export async function isReleasedGradesOrganizationEnabledForOrganization(
  organizationId: string | null | undefined
): Promise<boolean> {
  return isTargetedFeatureFlagEnabled(
    'releasedGradesOrganization',
    organizationId
  );
}
