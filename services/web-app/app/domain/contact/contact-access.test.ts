import { describe, expect, test } from 'bun:test';
import { decideContactAccess, safeContactReturnPath } from './contact-access';

describe('Contact Us outside the Lounge', () => {
  test('an active teacher at a school with the flag on gets in', () => {
    expect(decideContactAccess({ role: 'TEACHER', isActive: true, isAdmin: false, flagOn: true })).toBe(true);
  });

  test('flag off, a student, or an inactive membership does not', () => {
    expect(decideContactAccess({ role: 'TEACHER', isActive: true, isAdmin: false, flagOn: false })).toBe(false);
    expect(decideContactAccess({ role: 'STUDENT', isActive: true, isAdmin: false, flagOn: true })).toBe(false);
    expect(decideContactAccess({ role: 'TEACHER', isActive: false, isAdmin: false, flagOn: true })).toBe(false);
  });

  test('the YAWP! team can always open it, to see what teachers see', () => {
    expect(decideContactAccess({ role: 'TEACHER', isActive: true, isAdmin: true, flagOn: false })).toBe(true);
  });

  test('goes back only to a page inside the app', () => {
    expect(safeContactReturnPath('/app/my-classes/abc')).toBe('/app/my-classes/abc');
    expect(safeContactReturnPath('https://evil.example')).toBe('/app');
    expect(safeContactReturnPath('//evil.example')).toBe('/app');
    expect(safeContactReturnPath(null)).toBe('/app');
  });
});
