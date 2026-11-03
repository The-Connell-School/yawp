import { expect, test } from 'bun:test';
import { AP_HISTORY_ASSIGNMENT_TYPE_KEY } from '~/domain/ap-history/schema';
import {
  resolveSiteLicenseLockedAssignmentTiles,
  siteLicenseLockedAssignmentTilesForOrganization,
} from './site-license-locked-assignment-tiles';

const catalog = [
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
  {
    id: 'prewriting',
    title: 'Prewriting',
    kind: 'prewriting',
    systemKey: null,
  },
];

test('orders locked tiles and skips free-bundle kinds', () => {
  const tiles = resolveSiteLicenseLockedAssignmentTiles(catalog);
  expect(tiles.map((tile) => tile.key)).toEqual([
    'thesis_driven_essay',
    'ap_history_essay',
    'daily_pages',
    'act_writing',
  ]);
  expect(tiles[0]?.label).toBe('Thesis-Driven Essay');
});

test('returns no tiles for paid organizations', () => {
  expect(
    siteLicenseLockedAssignmentTilesForOrganization(
      { plan: 'SCHOOL' },
      catalog
    )
  ).toEqual([]);
});

test('skips specs with no matching assignment type in the catalog', () => {
  const tiles = resolveSiteLicenseLockedAssignmentTiles(
    catalog.filter((type) => type.kind !== 'act_writing')
  );
  expect(tiles.some((tile) => tile.key === 'act_writing')).toBe(false);
  expect(tiles.some((tile) => tile.key === 'ap_english_language')).toBe(false);
});

test('org-owned act title decoy does not win over the platform act_writing kind', () => {
  const tiles = resolveSiteLicenseLockedAssignmentTiles([
    {
      id: 'decoy',
      title: 'Spring ACT Writing Unit',
      kind: null,
      systemKey: null,
      ownerOrgId: null,
      ownerMembershipId: null,
    },
    {
      id: 'platform-act',
      title: 'ACT Writing Section',
      kind: 'act_writing',
      systemKey: null,
      ownerOrgId: null,
      ownerMembershipId: null,
    },
  ]);
  const actTile = tiles.find((tile) => tile.key === 'act_writing');
  expect(actTile?.assignmentTypeId).toBe('platform-act');
  expect(actTile?.label).toBe('ACT Writing Practice');
});

test('org-owned act_writing kind does not become the locked act tile', () => {
  const tiles = resolveSiteLicenseLockedAssignmentTiles([
    {
      id: 'org-act',
      title: 'School ACT clone',
      kind: 'act_writing',
      systemKey: null,
      ownerOrgId: 'school-org',
      ownerMembershipId: null,
    },
    {
      id: 'platform-act',
      title: 'ACT Writing Section',
      kind: null,
      systemKey: null,
      ownerOrgId: null,
      ownerMembershipId: null,
    },
  ]);
  expect(tiles.find((tile) => tile.key === 'act_writing')?.assignmentTypeId).toBe(
    'platform-act'
  );
});
