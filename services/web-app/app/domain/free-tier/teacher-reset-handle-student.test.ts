import { describe, expect, test } from 'bun:test';
import { evaluateTeacherResetHandleStudentEligibility } from './teacher-reset-handle-student';

describe('evaluateTeacherResetHandleStudentEligibility', () => {
  const baseUser = {
    email: null,
    isAdmin: false,
    isSuperAdmin: false,
  };

  test('allows handle-only students with only student memberships', () => {
    expect(
      evaluateTeacherResetHandleStudentEligibility(baseUser, [
        { role: 'STUDENT', isActive: true },
      ])
    ).toEqual({ ok: true });
  });

  test('refuses when the student has an email', () => {
    const result = evaluateTeacherResetHandleStudentEligibility(
      { ...baseUser, email: 'student@school.edu' },
      [{ role: 'STUDENT', isActive: true }]
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('has_email');
  });

  test('refuses platform admins', () => {
    const result = evaluateTeacherResetHandleStudentEligibility(
      { ...baseUser, isAdmin: true },
      [{ role: 'STUDENT', isActive: true }]
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('privileged_user');
  });

  test('refuses super admins', () => {
    const result = evaluateTeacherResetHandleStudentEligibility(
      { ...baseUser, isSuperAdmin: true },
      [{ role: 'STUDENT', isActive: true }]
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('privileged_user');
  });

  test('refuses when any active membership is not student', () => {
    const result = evaluateTeacherResetHandleStudentEligibility(baseUser, [
      { role: 'STUDENT', isActive: true },
      { role: 'TEACHER', isActive: true },
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('non_student_membership');
  });
});
