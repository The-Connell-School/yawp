import { expect, test } from 'bun:test';
import { BELOW_HS_TAG, withBelowHsTag, isBelowHsGrade } from './grade-gate';

test('shared tagging preserves existing tags and is idempotent', () => {
  const tags = ['event', 'other'];
  expect(withBelowHsTag(tags)).toEqual(['event', 'other', BELOW_HS_TAG]);
  expect(withBelowHsTag(withBelowHsTag(tags))).toEqual(withBelowHsTag(tags));
  expect(tags).toEqual(['event', 'other']);
});
test('only explicit supported below-high-school grades qualify, never free text', () => {
  for (const grade of ['K', '1', '2', '3', '4', '5', '6', '7', '8']) expect(isBelowHsGrade(grade)).toBe(true);
  for (const grade of ['9', '10', '11', '12', 'mixed', '7th grade', 'middle', '', '0']) expect(isBelowHsGrade(grade)).toBe(false);
});
