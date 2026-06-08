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
  ASSIGNMENT_CREATION_STANDARDIZATION:
    'feature_assignment_creation_standardization',
  RELEASED_GRADES_ORGANIZATION_ENABLED_ORG_IDS:
    'released_grades_organization_enabled_org_ids',
} as const;

export const PILOT_FEATURE_KEYS = {
  ASSIGNMENTS: 'assignments',
  ASSIGNMENT_CREATION_STANDARDIZATION: 'assignment_creation_standardization',
  DOCUMENT_SUBMISSION_GRADING: 'document_submission_grading',
  AP_HISTORY_ESSAY: 'ap_history_essay',
} as const;

type PilotFeatureKey =
  (typeof PILOT_FEATURE_KEYS)[keyof typeof PILOT_FEATURE_KEYS];

type FeatureAccessTargetKind = 'organization' | 'school' | 'teacher' | 'class';

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

function buildFeatureAccessTargets({
  organizationIds,
  schoolIds,
  teacherProfileIds,
  classIds,
}: {
  organizationIds?: Array<string | null | undefined>;
  schoolIds?: Array<string | null | undefined>;
  teacherProfileIds?: Array<string | null | undefined>;
  classIds?: Array<string | null | undefined>;
}): FeatureAccessTargetInput[] {
  return [
    { kind: 'organization', ids: organizationIds ?? [] },
    { kind: 'school', ids: schoolIds ?? [] },
    { kind: 'teacher', ids: teacherProfileIds ?? [] },
    { kind: 'class', ids: classIds ?? [] },
  ];
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
  organizationIds,
  schoolId,
  schoolIds,
  teacherProfileId,
  teacherProfileIds,
  classIds,
}: {
  organizationId: string | null | undefined;
  organizationIds?: Array<string | null | undefined>;
  schoolId?: string | null;
  schoolIds?: Array<string | null | undefined>;
  teacherProfileId?: string | null;
  teacherProfileIds?: Array<string | null | undefined>;
  classIds?: Array<string | null | undefined>;
}): Promise<boolean> {
  const scopedOrganizationIds = distinctIds([
    organizationId,
    ...(organizationIds ?? []),
  ]);

  const organizationFlags = await Promise.all(
    scopedOrganizationIds.map((scopedOrganizationId) =>
      isAssignmentsEnabledForOrganization(scopedOrganizationId)
    )
  );
  if (organizationFlags.some(Boolean)) return true;

  return isPilotFeatureEnabledForTargets(
    PILOT_FEATURE_KEYS.ASSIGNMENTS,
    buildFeatureAccessTargets({
      organizationIds: scopedOrganizationIds,
      schoolIds: [schoolId, ...(schoolIds ?? [])],
      teacherProfileIds: [teacherProfileId, ...(teacherProfileIds ?? [])],
      classIds,
    })
  );
}

export async function isAssignmentCreationStandardizationEnabledForContext({
  organizationId,
  organizationIds,
  schoolId,
  schoolIds,
  teacherProfileId,
  teacherProfileIds,
  classIds,
}: {
  organizationId: string | null | undefined;
  organizationIds?: Array<string | null | undefined>;
  schoolId?: string | null;
  schoolIds?: Array<string | null | undefined>;
  teacherProfileId?: string | null;
  teacherProfileIds?: Array<string | null | undefined>;
  classIds?: Array<string | null | undefined>;
}): Promise<boolean> {
  const globalEnabled = await getFeatureFlag(
    FEATURE_FLAGS.ASSIGNMENT_CREATION_STANDARDIZATION
  );
  if (globalEnabled) return true;

  const scopedOrganizationIds = distinctIds([
    organizationId,
    ...(organizationIds ?? []),
  ]);

  return isPilotFeatureEnabledForTargets(
    PILOT_FEATURE_KEYS.ASSIGNMENT_CREATION_STANDARDIZATION,
    buildFeatureAccessTargets({
      organizationIds: scopedOrganizationIds,
      schoolIds: [schoolId, ...(schoolIds ?? [])],
      teacherProfileIds: [teacherProfileId, ...(teacherProfileIds ?? [])],
      classIds,
    })
  );
}

async function isClassAssignmentCreationStandardizationEnabledForContext({
  fallbackOrganizationId,
  fallbackTeacherProfileIds,
  klass,
}: {
  fallbackOrganizationId: string | null | undefined;
  fallbackTeacherProfileIds: Array<string | null | undefined>;
  klass: {
    id: string;
    organizationId?: string | null | undefined;
    schoolId?: string | null | undefined;
    teacherProfileIds?: Array<string | null | undefined>;
  };
}): Promise<boolean> {
  const classTeacherProfileIds =
    klass.teacherProfileIds && klass.teacherProfileIds.length > 0
      ? klass.teacherProfileIds
      : fallbackTeacherProfileIds;

  return isAssignmentCreationStandardizationEnabledForContext({
    organizationId: klass.organizationId ?? fallbackOrganizationId,
    schoolId: klass.schoolId,
    teacherProfileIds: classTeacherProfileIds,
    classIds: [klass.id],
  });
}

async function isClassAssignmentsEnabledForContext({
  fallbackOrganizationId,
  fallbackTeacherProfileIds,
  klass,
}: {
  fallbackOrganizationId: string | null | undefined;
  fallbackTeacherProfileIds: Array<string | null | undefined>;
  klass: {
    id: string;
    organizationId?: string | null | undefined;
    schoolId?: string | null | undefined;
    teacherProfileIds?: Array<string | null | undefined>;
  };
}): Promise<boolean> {
  const classTeacherProfileIds =
    klass.teacherProfileIds && klass.teacherProfileIds.length > 0
      ? klass.teacherProfileIds
      : fallbackTeacherProfileIds;

  return isAssignmentsEnabledForContext({
    organizationId: klass.organizationId ?? fallbackOrganizationId,
    schoolId: klass.schoolId,
    teacherProfileIds: classTeacherProfileIds,
    classIds: [klass.id],
  });
}

async function isDocumentSubmissionSchoolAllowlistEnabled(): Promise<{
  globalEnabled: boolean;
  enabledSchoolIds: Set<string>;
}> {
  const globalEnabled = await getFeatureFlag(FEATURE_FLAGS.DOCUMENT_SUBMISSION);
  if (globalEnabled) {
    return { globalEnabled: true, enabledSchoolIds: new Set() };
  }

  return {
    globalEnabled: false,
    enabledSchoolIds:
      (await getTargetedFeatureFlagIds('documentSubmission')) ?? new Set(),
  };
}

function isSchoolAllowlisted(
  schoolId: string | null | undefined,
  enabledSchoolIds: Set<string>
): boolean {
  return Boolean(schoolId && enabledSchoolIds.has(schoolId));
}

async function isDocumentSubmissionPilotEnabledForTargets({
  organizationIds,
  schoolIds,
  teacherProfileIds,
  classIds,
}: {
  organizationIds?: Array<string | null | undefined>;
  schoolIds?: Array<string | null | undefined>;
  teacherProfileIds?: Array<string | null | undefined>;
  classIds?: Array<string | null | undefined>;
}): Promise<boolean> {
  return isPilotFeatureEnabledForTargets(
    PILOT_FEATURE_KEYS.DOCUMENT_SUBMISSION_GRADING,
    buildFeatureAccessTargets({
      organizationIds,
      schoolIds,
      teacherProfileIds,
      classIds,
    })
  );
}

async function isDocumentSubmissionClassScopeEnabled(
  classScope: {
    organizationId?: string | null | undefined;
    schoolId: string | null | undefined;
    classId?: string | null | undefined;
    teacherProfileIds?: Array<string | null | undefined>;
  },
  enabledSchoolIds: Set<string>,
  actorTeacherProfileId?: string | null
): Promise<boolean> {
  if (isSchoolAllowlisted(classScope.schoolId, enabledSchoolIds)) return true;

  return isDocumentSubmissionPilotEnabledForTargets({
    organizationIds: [classScope.organizationId],
    schoolIds: [classScope.schoolId],
    teacherProfileIds: actorTeacherProfileId
      ? [actorTeacherProfileId]
      : (classScope.teacherProfileIds ?? []),
    classIds: [classScope.classId],
  });
}

async function isAnyDocumentSubmissionClassScopeEnabled(
  classScopes: Array<{
    organizationId?: string | null | undefined;
    schoolId: string | null | undefined;
    classId?: string | null | undefined;
    teacherProfileIds?: Array<string | null | undefined>;
  }>,
  enabledSchoolIds: Set<string>,
  actorTeacherProfileId?: string | null
): Promise<boolean> {
  for (const classScope of classScopes) {
    const enabled = await isDocumentSubmissionClassScopeEnabled(
      classScope,
      enabledSchoolIds,
      actorTeacherProfileId
    );
    if (enabled) return true;
  }

  return false;
}

export async function getAssignmentsEnabledClassIdsForContext({
  organizationId,
  teacherProfileId,
  teacherProfileIds,
  classes,
}: {
  organizationId: string | null | undefined;
  teacherProfileId?: string | null;
  teacherProfileIds?: Array<string | null | undefined>;
  classes: Array<{
    id: string | null | undefined;
    organizationId?: string | null | undefined;
    schoolId?: string | null | undefined;
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
      const enabled = await isClassAssignmentsEnabledForContext({
        fallbackOrganizationId: organizationId,
        fallbackTeacherProfileIds: [
          teacherProfileId,
          ...(teacherProfileIds ?? []),
        ],
        klass,
      });
      return { id: klass.id, enabled };
    })
  );

  return classFlags.filter((klass) => klass.enabled).map((klass) => klass.id);
}

export async function getAssignmentCreationStandardizationEnabledClassIdsForContext({
  organizationId,
  teacherProfileId,
  teacherProfileIds,
  classes,
}: {
  organizationId: string | null | undefined;
  teacherProfileId?: string | null;
  teacherProfileIds?: Array<string | null | undefined>;
  classes: Array<{
    id: string | null | undefined;
    organizationId?: string | null | undefined;
    schoolId?: string | null | undefined;
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
      const enabled =
        await isClassAssignmentCreationStandardizationEnabledForContext({
          fallbackOrganizationId: organizationId,
          fallbackTeacherProfileIds: [
            teacherProfileId,
            ...(teacherProfileIds ?? []),
          ],
          klass,
        });
      return { id: klass.id, enabled };
    })
  );

  return classFlags.filter((klass) => klass.enabled).map((klass) => klass.id);
}

export async function isApHistoryEssayEnabledForContext({
  organizationId,
  schoolIds,
  teacherProfileId,
  teacherProfileIds,
  classIds,
}: {
  organizationId: string | null | undefined;
  schoolIds?: Array<string | null | undefined>;
  teacherProfileId?: string | null;
  teacherProfileIds?: Array<string | null | undefined>;
  classIds?: Array<string | null | undefined>;
}): Promise<boolean> {
  return isPilotFeatureEnabledForTargets(PILOT_FEATURE_KEYS.AP_HISTORY_ESSAY, [
    { kind: 'organization', ids: [organizationId] },
    { kind: 'school', ids: schoolIds ?? [] },
    { kind: 'teacher', ids: [teacherProfileId, ...(teacherProfileIds ?? [])] },
    { kind: 'class', ids: classIds ?? [] },
  ]);
}

export async function isDocumentSubmissionEnabledForScope({
  schoolIds,
  organizationIds,
  teacherProfileIds,
  classIds,
  classScopes,
  actorTeacherProfileId,
}: {
  schoolIds: Array<string | null | undefined>;
  organizationIds?: Array<string | null | undefined>;
  teacherProfileIds?: Array<string | null | undefined>;
  classIds?: Array<string | null | undefined>;
  classScopes?: Array<{
    organizationId?: string | null | undefined;
    schoolId: string | null | undefined;
    classId?: string | null | undefined;
    teacherProfileIds?: Array<string | null | undefined>;
  }>;
  actorTeacherProfileId?: string | null;
}): Promise<boolean> {
  const { globalEnabled, enabledSchoolIds } =
    await isDocumentSubmissionSchoolAllowlistEnabled();
  if (globalEnabled) return true;

  if (classScopes && classScopes.length > 0) {
    const actorScopedClassScopes = actorTeacherProfileId
      ? classScopes.filter((classScope) =>
          (classScope.teacherProfileIds ?? []).includes(actorTeacherProfileId)
        )
      : classScopes;

    return isAnyDocumentSubmissionClassScopeEnabled(
      actorScopedClassScopes,
      enabledSchoolIds,
      actorTeacherProfileId
    );
  }

  if (
    schoolIds.some((schoolId) =>
      isSchoolAllowlisted(schoolId, enabledSchoolIds)
    )
  ) {
    return true;
  }

  return isDocumentSubmissionPilotEnabledForTargets({
    organizationIds,
    schoolIds,
    teacherProfileIds,
    classIds,
  });
}

export async function isReleasedGradesOrganizationEnabledForOrganization(
  organizationId: string | null | undefined
): Promise<boolean> {
  return isTargetedFeatureFlagEnabled(
    'releasedGradesOrganization',
    organizationId
  );
}
