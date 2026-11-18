import { expect, test } from 'bun:test';
import { isSupportedSignupGrade } from './public-onboarding.server';

test('supported signup grades include middle school through high school', () => {
  for (const grade of ['6', '7', '8', '9', '10', '11', '12'])
    expect(isSupportedSignupGrade(grade)).toBe(true);
  for (const grade of ['K', '1', '2', '3', '4', '5'])
    expect(isSupportedSignupGrade(grade)).toBe(true);
  expect(isSupportedSignupGrade('college')).toBe(false);
});