import { prisma } from './db.server';

export type TargetedFeatureFlagDefinition = {
  label: string;
  settingName: string;
  targetKind: 'organization' | 'school';
  description: string;
  globalSettingName?: string;
  globalLabel?: string;
  globalDescription?: string;
};

export const FEATURE_FLAGS = {
  DOCUMENT_SUBMISSION: 'document_submission_enabled',
  DOCUMENT_SUBMISSION_SCHOOL_IDS: 'document_submission_enabled_school_ids',
  ASSIGNMENTS_ENABLED_ORG_IDS: 'assignments_enabled_org_ids',
  RELEASED_GRADES_ORGANIZATION_ENABLED_ORG_IDS:
    'released_grades_organization_enabled_org_ids',
} as const;

export const PILOT_FEATURE_KEYS = {
  ASSIGNMENTS: 'assignments',
  DOCUMENT_SUBMISSION_GRADING: 'document_submission_grading',
  AP_HISTORY_ESSAY: 'ap_history_essay',
} as const;

type PilotFeatureKey =
  (typeof PILOT_FEATURE_KEYS)[keyof typeof PILOT_FEATURE_KEYS];

type FeatureAccessTargetKind = 'teacher' | 'class';

type FeatureAccessTargetInput = {
  kind: FeatureAccessTargetKind;
  ids: Array<string | null | undefined>;
};

export const TARGETED_FEATURE_FLAGS = {
  documentSubmission: {
    label: 'Document submission',
    settingName: FEATURE_FLAGS.DOCUMENT_SUBMISSION_SCHOOL_IDS,
    targetKind: 'school',
    description: 'School IDs allowed to use document submission and grading',
    globalSettingName: FEATURE_FLAGS.DOCUMENT_SUBMISSION,
    globalLabel: 'Enable for all schools',
    globalDescription:
      'Allow every school to use document submission and grading',
  },
  assignments: {
    label: 'Assignments',
    settingName: FEATURE_FLAGS.ASSIGNMENTS_ENABLED_ORG_IDS,
    targetKind: 'organization',
    description: 'Organization IDs allowed to use assignments',
  },
  releasedGradesOrganization: {
    label: 'Released grades organization',
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

export async function setFeatureFlagBoolean(
  name: string,
  enabled: boolean,
  description?: string
): Promise<string> {
  const value = enabled ? 'true' : 'false';
  await prisma.setting.upsert({
    where: { name },
    create: {
      id: name,
      name,
      description,
      value,
      valueType: 'boolean',
    },
    update: {
      description,
      value,
      valueType: 'boolean',
    },
  });

  return value;
}

export function parseSettingIdList(
  value: string | null | undefined
): Set<string> {
  return new Set(
    (value ?? '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
  );
}

export async function getSettingIdList(
  name: string
): Promise<Set<string> | null> {
  const setting = await prisma.setting.findUnique({
    where: { name },
    select: { value: true, valueType: true },
  });

  if (!setting) return null;
  if (
    setting.valueType !== 'string' &&
    setting.valueType !== 'arrayOfStrings'
  ) {
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
      id: definition.settingName,
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

  const enabledSchoolIds =
    await getTargetedFeatureFlagIds('documentSubmission');

  const distinctSchoolIds = Array.from(
    new Set(
      schoolIds.filter((schoolId): schoolId is string => Boolean(schoolId))
    )
  );
  if (distinctSchoolIds.length === 0) return false;

  return distinctSchoolIds.every((schoolId) => enabledSchoolIds.has(schoolId));
}

function distinctIds(ids: Array<string | null | undefined>): string[] {
  return Array.from(new Set(ids.filter((id): id is string => Boolean(id))));
}

async function isPilotFeatureEnabledForTargets(
  featureKey: PilotFeatureKey,
  targets: FeatureAccessTargetInput[]
): Promise<boolean> {
  const targetOr = targets
    .map((target) => ({
      targetKind: target.kind,
      ids: distinctIds(target.ids),
    }))
    .filter((target) => target.ids.length > 0)
    .map((target) => ({
      targetKind: target.targetKind,
      targetId: { in: target.ids },
    }));

  if (targetOr.length === 0) return false;

  const match = await prisma.featureAccessTarget.findFirst({
    where: {
      featureKey,
      enabled: true,
      OR: targetOr,
      AND: [
        {
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
      ],
    },
    select: { id: true },
  });

  return Boolean(match);
}

export async function isAssignmentsEnabledForOrganization(
  organizationId: string | null | undefined
): Promise<boolean> {
  return isTargetedFeatureFlagEnabled('assignments', organizationId);
}

export async function isAssignmentsEnabledForContext({
  organizationId,
  teacherProfileId,
  teacherProfileIds,
  classIds,
}: {
  organizationId: string | null | undefined;
  teacherProfileId?: string | null;
  teacherProfileIds?: Array<string | null | undefined>;
  classIds?: Array<string | null | undefined>;
}): Promise<boolean> {
  const organizationEnabled =
    await isAssignmentsEnabledForOrganization(organizationId);
  if (organizationEnabled) return true;

  const distinctClassIds = distinctIds(classIds ?? []);
  if (distinctClassIds.length > 0) {
    const classFlags = await Promise.all(
      distinctClassIds.map((classId) =>
        isPilotFeatureEnabledForTargets(PILOT_FEATURE_KEYS.ASSIGNMENTS, [
          { kind: 'class', ids: [classId] },
        ])
      )
    );
    return classFlags.every(Boolean);
  }

  return isPilotFeatureEnabledForTargets(PILOT_FEATURE_KEYS.ASSIGNMENTS, [
    { kind: 'teacher', ids: [teacherProfileId, ...(teacherProfileIds ?? [])] },
  ]);
}

export async function getAssignmentsEnabledClassIdsForContext({
  organizationId,
  classes,
}: {
  organizationId: string | null | undefined;
  teacherProfileId?: string | null;
  classes: Array<{
    id: string | null | undefined;
    organizationId?: string | null | undefined;
    teacherProfileIds?: Array<string | null | undefined>;
  }>;
}): Promise<string[]> {
  const distinctClasses = Array.from(
    new Map(
      classes
        .filter((klass): klass is (typeof classes)[number] & { id: string } =>
          Boolean(klass.id)
        )
        .map((klass) => [klass.id, klass])
    ).values()
  );
  if (distinctClasses.length === 0) return [];

  const classFlags = await Promise.all(
    distinctClasses.map(async (klass) => {
      const classOrganizationId = klass.organizationId ?? organizationId;
      const organizationEnabled =
        await isAssignmentsEnabledForOrganization(classOrganizationId);
      if (organizationEnabled) return { id: klass.id, enabled: true };

      const enabled = await isPilotFeatureEnabledForTargets(
        PILOT_FEATURE_KEYS.ASSIGNMENTS,
        [{ kind: 'class', ids: [klass.id] }]
      );
      return { id: klass.id, enabled };
    })
  );

  return classFlags
    .filter((klass) => klass.enabled)
    .map((klass) => klass.id);
}

export async function isDocumentSubmissionEnabledForScope({
  schoolIds,
  teacherProfileIds,
  classIds,
  classScopes,
}: {
  schoolIds: Array<string | null | undefined>;
  teacherProfileIds?: Array<string | null | undefined>;
  classIds?: Array<string | null | undefined>;
  classScopes?: Array<{
    schoolId: string | null | undefined;
    classId?: string | null | undefined;
    teacherProfileIds?: Array<string | null | undefined>;
  }>;
}): Promise<boolean> {
  const schoolsEnabled = await isDocumentSubmissionEnabledForSchools(schoolIds);
  if (schoolsEnabled) return true;

  if (classScopes && classScopes.length > 0) {
    const classScopeFlags = await Promise.all(
      classScopes.map(async (classScope) => {
        const schoolEnabled = await isDocumentSubmissionEnabledForSchools([
          classScope.schoolId,
        ]);
        if (schoolEnabled) return true;

        return isPilotFeatureEnabledForTargets(
          PILOT_FEATURE_KEYS.DOCUMENT_SUBMISSION_GRADING,
          [{ kind: 'class', ids: [classScope.classId] }]
        );
      })
    );

    return classScopeFlags.every(Boolean);
  }

  const distinctClassIds = distinctIds(classIds ?? []);
  if (distinctClassIds.length > 0) {
    const classFlags = await Promise.all(
      distinctClassIds.map((classId) =>
        isPilotFeatureEnabledForTargets(
          PILOT_FEATURE_KEYS.DOCUMENT_SUBMISSION_GRADING,
          [{ kind: 'class', ids: [classId] }]
        )
      )
    );

    return classFlags.every(Boolean);
  }

  return isPilotFeatureEnabledForTargets(
    PILOT_FEATURE_KEYS.DOCUMENT_SUBMISSION_GRADING,
    [{ kind: 'teacher', ids: teacherProfileIds ?? [] }]
  );
}

export async function isReleasedGradesOrganizationEnabledForOrganization(
  organizationId: string | null | undefined
): Promise<boolean> {
  return isTargetedFeatureFlagEnabled(
    'releasedGradesOrganization',
    organizationId
  );
}

export async function isApHistoryEssayEnabled({
  teacherProfileId,
  classIds,
}: {
  teacherProfileId?: string | null;
  classIds?: Array<string | null | undefined>;
}): Promise<boolean> {
  return isPilotFeatureEnabledForTargets(
    PILOT_FEATURE_KEYS.AP_HISTORY_ESSAY,
    [
      { kind: 'teacher', ids: [teacherProfileId] },
      { kind: 'class', ids: classIds ?? [] },
    ]
  );
}
