import { describe, expect, test } from 'bun:test';
import {
  FREE_CLASSROOM_STUDENT_SEAT_CAP,
  canAddStudentToFreeClass,
} from './class-seat-cap';

describe('canAddStudentToFreeClass', () => {
  test('allows up to cap minus one enrolled students', () => {
    expect(
      canAddStudentToFreeClass({
        currentStudents: FREE_CLASSROOM_STUDENT_SEAT_CAP - 1,
      })
    ).toBe(true);
    expect(
      canAddStudentToFreeClass({
        currentStudents: FREE_CLASSROOM_STUDENT_SEAT_CAP,
      })
    ).toBe(false);
  });

  test('counts pending invites toward the cap', () => {
    expect(
      canAddStudentToFreeClass({
        currentStudents: FREE_CLASSROOM_STUDENT_SEAT_CAP - 1,
        pendingInvites: 1,
      })
    ).toBe(false);
    expect(
      canAddStudentToFreeClass({
        currentStudents: 30,
        pendingInvites: 4,
      })
    ).toBe(true);
  });
});
