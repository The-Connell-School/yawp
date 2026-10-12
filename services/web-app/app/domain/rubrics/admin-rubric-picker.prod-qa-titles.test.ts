import { describe, expect, test } from 'bun:test';
import fixture from './__fixtures__/prod-rubric-catalog.json';
import {
  disambiguateAdminRubricPickerTitles,
  pickerOwnershipLabel,
  type AdminRubricPickerOption,
} from './admin-rubric-picker.server';
import { perTypeKey } from './rubric-catalog.server';

const QA_V1 = 'prod-qa-writing-assignment-type';
const QA_V3 = 'prod-qa-v3-writing-assignment-type';

describe('production-shaped QA writing picker titles', () => {
  test('fixture rows share a title and disambiguate by org ownership label', () => {
    const rows = fixture.perTypeRubrics.filter(
      (row) => row.id === QA_V1 || row.id === QA_V3
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]?.title).toBe(rows[1]?.title);

    const ownership = new Map(
      rows.map((row) => [
        perTypeKey(row.id),
        pickerOwnershipLabel({
          id: row.id,
          title: row.title,
          ownerOrg: {
            name:
              row.ownerOrgId === 'prod-qa-v3-org'
                ? 'Production QA v3 Organization'
                : 'Production QA Organization',
          },
          schoolAssignments: [],
          organizationAssignments: [],
        }),
      ])
    );

    const options: AdminRubricPickerOption[] = rows.map((row) => ({
      id: perTypeKey(row.id),
      catalogKey: perTypeKey(row.id),
      name: perTypeKey(row.id),
      title: row.title as string,
      json: '{}',
      source: 'assignment-type',
    }));

    const disambiguated = disambiguateAdminRubricPickerTitles(options, ownership);
    const titles = disambiguated.map((row) => row.title);
    expect(new Set(titles).size).toBe(2);
    expect(titles.join(' ')).toContain('Production QA Organization');
    expect(titles.join(' ')).toContain('Production QA v3 Organization');
  });
});
