import { describe, expect, test } from 'bun:test';
import { decideLoungeAccess } from './access';

describe('decideLoungeAccess', () => {
  test('a teacher at a school with the flag on can use the Lounge', () => {
    expect(decideLoungeAccess({ role: 'TEACHER', isActive: true, isAdmin: false, flagOn: true })).toEqual({
      allowed: true,
      isStaff: false,
    });
  });

  test('a teacher at a school with the flag off cannot', () => {
    expect(decideLoungeAccess({ role: 'TEACHER', isActive: true, isAdmin: false, flagOn: false }).allowed).toBe(false);
  });

  test('students never can, even with the flag on', () => {
    expect(decideLoungeAccess({ role: 'STUDENT', isActive: true, isAdmin: false, flagOn: true }).allowed).toBe(false);
  });

  test('an inactive teacher membership cannot', () => {
    expect(decideLoungeAccess({ role: 'TEACHER', isActive: false, isAdmin: false, flagOn: true }).allowed).toBe(false);
  });

  test('the Yawp team always can, as staff, whatever their school flag says', () => {
    expect(decideLoungeAccess({ role: 'STUDENT', isActive: true, isAdmin: true, flagOn: false })).toEqual({
      allowed: true,
      isStaff: true,
    });
  });
});
