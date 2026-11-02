import { describe, expect, test } from 'bun:test';
import {
  resolveClassDetailStudentInviteState,
  resolveClassHeaderTab,
} from './class-detail-header';

describe('resolveClassHeaderTab', () => {
  test('maps page tab to header tab', () => {
    expect(resolveClassHeaderTab('students')).toBe('students');
    expect(resolveClassHeaderTab('documents')).toBe('documents');
    expect(resolveClassHeaderTab('assignments')).toBe('assignments');
  });
});

describe('resolveClassDetailStudentInviteState', () => {
  const base = {
    usageMonthly: true,
    usageClassId: 'class-1',
    klassId: 'class-1',
    klassCode: 'ABCD-EFGH-IJKL-MNOP',
    classCodeHidden: false,
    teachingLocked: false,
  };

  test('shows ready invite for monthly free class with visible code', () => {
    expect(resolveClassDetailStudentInviteState(base)).toBe('ready');
  });

  test('hides invite when class code is hidden', () => {
    expect(
      resolveClassDetailStudentInviteState({
        ...base,
        classCodeHidden: true,
      })
    ).toBe('none');
  });

  test('locks invite when teaching is locked', () => {
    expect(
      resolveClassDetailStudentInviteState({
        ...base,
        teachingLocked: true,
      })
    ).toBe('locked');
  });

  test('hides invite outside monthly free class', () => {
    expect(
      resolveClassDetailStudentInviteState({
        ...base,
        usageMonthly: false,
      })
    ).toBe('none');
    expect(
      resolveClassDetailStudentInviteState({
        ...base,
        usageClassId: 'other-class',
      })
    ).toBe('none');
  });
});
