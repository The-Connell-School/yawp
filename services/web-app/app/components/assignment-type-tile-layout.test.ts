import { expect, test } from 'bun:test';
import {
  assignmentTypeTileCardClassName,
  assignmentTypeTileGridClassName,
  assignmentTypeTileImageClassName,
} from './assignment-type-tile-layout';

test('assignment image tiles use a taller aspect ratio and capped width', () => {
  expect(assignmentTypeTileImageClassName).toContain('aspect-[3/4]');
  expect(assignmentTypeTileImageClassName).toContain('object-cover');
  expect(assignmentTypeTileCardClassName()).toContain('max-w-');
  expect(assignmentTypeTileGridClassName()).toContain('justify-items-start');
});
