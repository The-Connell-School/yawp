export type FlagTargetKind = 'organization' | 'school';

export type PreviewFlagDefinition = {
  settingName: string;
  description: string;
  targetKind: FlagTargetKind;
  globalSettingName?: string;
};

export type SettingUpsert = {
  name: string;
  description: string;
  value: string;
  valueType: 'string' | 'boolean';
};

// Mirrors TARGETED_FEATURE_FLAGS in
// services/web-app/app/utils/feature-flags.server.ts. The drift test in
// preview-enable-targeted-flags.test.ts asserts every flag named there is
// represented here.
export const PREVIEW_TARGETED_FLAGS: PreviewFlagDefinition[] = [
  {
    settingName: 'document_submission_enabled_school_ids',
    description: 'School IDs allowed to use document submission and grading',
    targetKind: 'school',
    globalSettingName: 'document_submission_enabled',
  },
  {
    settingName: 'assignments_enabled_org_ids',
    description: 'Organization IDs allowed to use assignments',
    targetKind: 'organization',
  },
  {
    settingName: 'released_grades_organization_enabled_org_ids',
    description:
      'Organization IDs allowed to use released grades organization view',
    targetKind: 'organization',
  },
  {
    settingName: 'essay_examples_enabled_org_ids',
    description:
      'Organization IDs allowed to see the YAWP! Library of model essays',
    targetKind: 'organization',
  },
];

export function computePreviewFlagUpserts(
  flags: PreviewFlagDefinition[],
  ids: { orgIds: string[]; schoolIds: string[] }
): SettingUpsert[] {
  const orgList = [...new Set(ids.orgIds)].sort().join(',');
  const schoolList = [...new Set(ids.schoolIds)].sort().join(',');

  const upserts: SettingUpsert[] = [];
  for (const flag of flags) {
    const value = flag.targetKind === 'organization' ? orgList : schoolList;
    upserts.push({
      name: flag.settingName,
      description: flag.description,
      value,
      valueType: 'string',
    });
    if (flag.globalSettingName) {
      upserts.push({
        name: flag.globalSettingName,
        description: flag.description,
        value: 'true',
        valueType: 'boolean',
      });
    }
  }
  return upserts;
}
