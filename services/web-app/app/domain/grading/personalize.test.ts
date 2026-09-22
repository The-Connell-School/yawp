import { describe, expect, test } from 'bun:test';
import { firstNameFromFullName, gradingAddressee } from './personalize';

describe('firstNameFromFullName', () => {
  test('falls back to Student when missing', () => {
    expect(firstNameFromFullName('')).toBe('Student');
    expect(firstNameFromFullName(null)).toBe('Student');
    expect(firstNameFromFullName(undefined)).toBe('Student');
  });
});

describe('gradingAddressee', () => {
  test('addresses a solo essay to the student', () => {
    expect(gradingAddressee({ studentName: 'Fen Zhao' })).toBe('Fen');
  });

  test('addresses a group brief to the group, not to one member', () => {
    // The whole point. `Document.membershipId` names the first member of the
    // group, so without this the feedback on work three students wrote opens
    // with one of their names, in front of the other two.
    expect(
      gradingAddressee({ studentName: 'Fen Zhao', groupLabel: 'Group 3' })
    ).toBe('Group 3');
  });

  test('ignores a blank group label rather than addressing nobody', () => {
    expect(
      gradingAddressee({ studentName: 'Fen Zhao', groupLabel: '   ' })
    ).toBe('Fen');
    expect(
      gradingAddressee({ studentName: 'Fen Zhao', groupLabel: null })
    ).toBe('Fen');
  });

  test('still falls back to Student when there is neither', () => {
    expect(gradingAddressee({})).toBe('Student');
  });
});
