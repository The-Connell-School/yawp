import { expect, test } from 'bun:test';
import {
  teachingAccessBannerMessage,
  TEACHING_ACCESS_LOCKED_TOOLTIP,
} from './teaching-access-copy';

test('teachingAccessBannerMessage includes admin name', () => {
  expect(teachingAccessBannerMessage('Dr. Patel')).toBe(
    'Waiting for Dr. Patel to approve your classroom.'
  );
});

test('locked tooltip copy matches design spec', () => {
  expect(TEACHING_ACCESS_LOCKED_TOOLTIP).toBe(
    'Unlocks once your administrator approves.'
  );
});
