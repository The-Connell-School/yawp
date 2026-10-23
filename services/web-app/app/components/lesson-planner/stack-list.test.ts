import { describe, expect, test } from 'bun:test';
import { moveKey } from './stack-list';

describe('moveKey', () => {
  test('moves a piece to the front', () => {
    expect(moveKey(['a', 'b', 'c'], 'c', 0)).toEqual(['c', 'a', 'b']);
  });
  test('moves a piece one step down', () => {
    expect(moveKey(['a', 'b', 'c'], 'a', 1)).toEqual(['b', 'a', 'c']);
  });
  test('drops a piece onto the last place', () => {
    expect(moveKey(['a', 'b', 'c'], 'a', 2)).toEqual(['b', 'c', 'a']);
  });
  test('an unknown piece changes nothing', () => {
    expect(moveKey(['a', 'b'], 'z', 0)).toEqual(['a', 'b']);
  });
});
