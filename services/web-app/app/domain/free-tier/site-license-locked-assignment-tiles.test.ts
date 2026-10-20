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
  expect(tiles[0]?.label).toBe('The Thesis-Driven Essay');
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
