import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  PREVIEW_TARGETED_FLAGS,
  computePreviewFlagUpserts,
} from './preview-enable-targeted-flags.helpers';

describe('computePreviewFlagUpserts', () => {
  test('org-targeted flag populated with all org ids, deduped and sorted', () => {
    const upserts = computePreviewFlagUpserts(
      [
        {
          settingName: 'assignments_enabled_org_ids',
          description: 'd',
          targetKind: 'organization',
        },
      ],
      { orgIds: ['b', 'a', 'a', 'c'], schoolIds: [] }
    );
    expect(upserts).toEqual([
      {
        name: 'assignments_enabled_org_ids',
        description: 'd',
        value: 'a,b,c',
        valueType: 'string',
      },
    ]);
  });

  test('school-targeted flag reads school ids, not org ids', () => {
    const upserts = computePreviewFlagUpserts(
      [
        {
          settingName: 'document_submission_enabled_school_ids',
          description: 'd',
          targetKind: 'school',
        },
      ],
      { orgIds: ['ignored'], schoolIds: ['s2', 's1'] }
    );
    expect(upserts[0].value).toBe('s1,s2');
  });

  test('emits a true boolean for globalSettingName when set', () => {
    const upserts = computePreviewFlagUpserts(
      [
        {
          settingName: 'document_submission_enabled_school_ids',
          description: 'd',
          targetKind: 'school',
          globalSettingName: 'document_submission_enabled',
        },
      ],
      { orgIds: [], schoolIds: ['s1'] }
    );
    expect(upserts).toContainEqual({
      name: 'document_submission_enabled',
      description: 'd',
      value: 'true',
      valueType: 'boolean',
    });
  });

  test('empty id list yields an empty string value (still upserts the row)', () => {
    const upserts = computePreviewFlagUpserts(
      [
        {
          settingName: 'assignments_enabled_org_ids',
          description: 'd',
          targetKind: 'organization',
        },
      ],
      { orgIds: [], schoolIds: [] }
    );
    expect(upserts[0].value).toBe('');
  });
});

describe('PREVIEW_TARGETED_FLAGS drift check', () => {
  test('covers every targeted flag declared in feature-flags.server.ts', () => {
    const source = readFileSync(
      resolve(
        import.meta.dir,
        '../../../services/web-app/app/utils/feature-flags.server.ts'
      ),
      'utf8'
    );

    // Extract the TARGETED_FEATURE_FLAGS object body, then every settingName
    // assignment inside it. Setting names live in the FEATURE_FLAGS const
    // above as `KEY: 'value'`, so we resolve indirections through that map.
    const featureFlagsMatch = source.match(
      /export const FEATURE_FLAGS = \{([\s\S]*?)\} as const;/
    );
    if (!featureFlagsMatch) throw new Error('FEATURE_FLAGS const not found');
    const featureFlagsMap = new Map<string, string>();
    for (const m of featureFlagsMatch[1].matchAll(
      /(\w+):\s*\n?\s*'([^']+)'/g
    )) {
      featureFlagsMap.set(m[1], m[2]);
    }

    const targetedMatch = source.match(
      /export const TARGETED_FEATURE_FLAGS = \{([\s\S]*?)\} as const satisfies/
    );
    if (!targetedMatch)
      throw new Error('TARGETED_FEATURE_FLAGS const not found');

    const referencedNames = new Set<string>();
    for (const m of targetedMatch[1].matchAll(
      /settingName:\s*FEATURE_FLAGS\.(\w+)/g
    )) {
      const resolved = featureFlagsMap.get(m[1]);
      if (!resolved) throw new Error(`Unknown FEATURE_FLAGS key ${m[1]}`);
      referencedNames.add(resolved);
    }

    const covered = new Set(PREVIEW_TARGETED_FLAGS.map((f) => f.settingName));
    const missing = [...referencedNames].filter((n) => !covered.has(n));
    expect(missing).toEqual([]);
  });
});
