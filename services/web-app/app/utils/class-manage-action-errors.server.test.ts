import { describe, expect, test } from 'bun:test';
import { ClassCodeCollisionError } from '~/utils/class-code-write.server';
import { TEACHER_CLASS_IDENTITY_CONFLICT_MESSAGE } from '~/utils/class-identity.server';
import {
  CLASS_CODE_COLLISION_MESSAGE,
  CLASS_MANAGE_UNKNOWN_UNIQUE_CREATE_MESSAGE,
  CLASS_MANAGE_UNKNOWN_UNIQUE_UPDATE_MESSAGE,
  LEGACY_CLASS_PERIOD_UNIQUE_TEACHER_MESSAGE,
  classManageActionErrorFromCaught,
  isClassCodeUniqueViolation,
} from '~/utils/class-manage-action-errors.server';

describe('classManageActionErrorFromCaught', () => {
  test('maps ClassCodeCollisionError to code field error', () => {
    const result = classManageActionErrorFromCaught(
      new ClassCodeCollisionError(),
      'create'
    );
    expect(result).toEqual({
      error: CLASS_CODE_COLLISION_MESSAGE,
      field: 'code',
      status: 400,
    });
  });

  test('maps P2002 on schoolId+code to code collision copy', () => {
    const result = classManageActionErrorFromCaught(
      {
        code: 'P2002',
        meta: { target: ['schoolId', 'code'] },
      },
      'update'
    );
    expect(result?.field).toBe('code');
    expect(result?.error).toBe(CLASS_CODE_COLLISION_MESSAGE);
  });

  test('maps legacy period-grade unique violations to migration message', () => {
    const result = classManageActionErrorFromCaught(
      {
        code: 'P2002',
        meta: { target: 'Class_schoolId_period_grade_key' },
      },
      'create'
    );
    expect(result?.error).toBe(LEGACY_CLASS_PERIOD_UNIQUE_TEACHER_MESSAGE);
  });

  test('maps schedule identity uniques to teacher identity copy', () => {
    const result = classManageActionErrorFromCaught(
      {
        code: 'P2002',
        meta: {
          driverAdapterError: {
            cause: {
              constraint: {
                fields: ['schoolId', 'schoolYear', 'period', 'grade', 'title'],
              },
            },
          },
        },
      },
      'create'
    );
    expect(result?.error).toBe(TEACHER_CLASS_IDENTITY_CONFLICT_MESSAGE);
  });

  test('uses clearer fallback for unmapped unique targets on create', () => {
    const result = classManageActionErrorFromCaught(
      {
        code: 'P2002',
        meta: {
          driverAdapterError: {
            cause: { constraint: { fields: ['schoolId', 'codeVersion'] } },
          },
        },
      },
      'create'
    );
    expect(result?.error).toBe(CLASS_MANAGE_UNKNOWN_UNIQUE_CREATE_MESSAGE);
  });

  test('uses update-specific fallback for unmapped unique targets', () => {
    const result = classManageActionErrorFromCaught(
      {
        code: 'P2002',
        meta: { target: ['someOtherUnique'] },
      },
      'update'
    );
    expect(result?.error).toBe(CLASS_MANAGE_UNKNOWN_UNIQUE_UPDATE_MESSAGE);
  });

  test('maps free classroom plan cap errors', () => {
    const result = classManageActionErrorFromCaught(
      new Error(
        'Free classroom accounts include one class. token=SECRET teacher@school.edu'
      ),
      'create'
    );
    expect(result?.status).toBe(403);
    expect(result?.error).toContain('Free classroom accounts include one class');
    expect(result?.error).not.toContain('SECRET');
  });

  test('returns null for unrelated errors', () => {
    expect(
      classManageActionErrorFromCaught(new Error('boom'), 'create')
    ).toBeNull();
  });
});

describe('isClassCodeUniqueViolation', () => {
  test('detects code in composite constraint fields', () => {
    expect(
      isClassCodeUniqueViolation({
        code: 'P2002',
        meta: {
          driverAdapterError: {
            cause: { constraint: { fields: ['schoolId', 'code'] } },
          },
        },
      })
    ).toBe(true);
  });
});
