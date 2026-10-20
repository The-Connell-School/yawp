import { expect, mock, test } from 'bun:test';
import { AP_HISTORY_ASSIGNMENT_TYPE_KEY } from '~/domain/ap-history/schema';

const findMany = mock(async () => [
  {
    id: 'thesis-driven',
    title: 'The Thesis-Driven Essay',
    kind: null,
    systemKey: null,
  },
  {
    id: 'ap-history',
    title: 'AP History Essay',
    kind: 'ap_history',
    systemKey: AP_HISTORY_ASSIGNMENT_TYPE_KEY,
  },
  {
    id: 'daily',
    title: 'Daily Pages',
    kind: 'daily_pages',
    systemKey: null,
  },
  {
    id: 'act',
    title: 'ACT Writing Section',
    kind: 'act_writing',
    systemKey: null,
  },
  {
    id: 'starter',
    title: 'Class Starter',
    kind: 'class_starter',
    systemKey: null,
  },
]);

test('loads locked tiles from the global catalog for FREE_CLASSROOM orgs', async () => {
  const { loadSiteLicenseLockedAssignmentTiles } = await import(
    './site-license-locked-assignment-tiles.server'
  );

  const scopedFreeBundleOnly = [
    { id: 'starter', title: 'Class Starter', kind: 'class_starter' },
    { id: 'prewriting', title: 'Prewriting', kind: 'prewriting' },
    {
      id: 'thesis-statement',
      title: 'Thesis Statement',
      kind: 'thesis_statement',
    },
  ];

  const tiles = await loadSiteLicenseLockedAssignmentTiles(
    { plan: 'FREE_CLASSROOM' },
    { assignmentType: { findMany } }
  );

  expect(findMany).toHaveBeenCalled();
  expect(tiles.map((tile) => tile.key)).toEqual([
    'thesis_driven_essay',
    'ap_history_essay',
    'daily_pages',
    'act_writing',
  ]);
  expect(
    scopedFreeBundleOnly.every((type) =>
      tiles.every((tile) => tile.assignmentTypeId !== type.id)
    )
  ).toBe(true);
});

test('returns no tiles for paid organizations without querying', async () => {
  findMany.mockClear();
  const { loadSiteLicenseLockedAssignmentTiles } = await import(
    './site-license-locked-assignment-tiles.server'
  );

  const tiles = await loadSiteLicenseLockedAssignmentTiles(
    { plan: 'SCHOOL' },
    { assignmentType: { findMany } }
  );

  expect(tiles).toEqual([]);
  expect(findMany).not.toHaveBeenCalled();
});
