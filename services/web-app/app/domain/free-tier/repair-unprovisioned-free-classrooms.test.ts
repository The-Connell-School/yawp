import { expect, test } from 'bun:test';
import { parseRepairArgs } from './repair-unprovisioned-free-classrooms.server';

test('repair defaults to dry-run and accepts one mode flag', () => {
  expect(parseRepairArgs([])).toEqual({ apply: false });
  expect(parseRepairArgs(['--dry-run'])).toEqual({ apply: false });
  expect(parseRepairArgs(['--apply'])).toEqual({ apply: true });
  expect(() => parseRepairArgs(['--apply', '--dry-run'])).toThrow(
    'Pass either --dry-run or --apply.'
  );
  expect(() => parseRepairArgs(['--prod'])).toThrow('Unknown argument --prod');
});
