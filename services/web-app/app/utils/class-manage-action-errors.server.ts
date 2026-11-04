import { ClassCodeCollisionError } from '~/utils/class-code-write.server';
import { CLASS_CODE_COLLISION_MESSAGE } from '~/utils/class-code-messages';
import {
  isLegacyClassPeriodUniqueViolation,
  TEACHER_CLASS_IDENTITY_CONFLICT_MESSAGE,
} from '~/utils/class-identity.server';
import {
  prismaUniqueConstraintTargets,
  uniqueConstraintIncludes,
} from '~/utils/prisma-unique-violation';
import { safeDomainErrorTextForClientResponse } from '~/utils/server-error-request-context.server';

export { CLASS_CODE_COLLISION_MESSAGE };

export const LEGACY_CLASS_PERIOD_UNIQUE_TEACHER_MESSAGE =
  'A class with this period and grade already exists at your school from a previous year. Your administrator needs to apply the latest Yawp database migration before you can recreate this section for the new school year.';

export const CLASS_MANAGE_UNKNOWN_UNIQUE_CREATE_MESSAGE =
  'This class could not be created because it conflicts with existing data. Check the class code and details, or try again.';

export const CLASS_MANAGE_UNKNOWN_UNIQUE_UPDATE_MESSAGE =
  'This class could not be updated because it conflicts with existing data. Check the class code and details, or try again.';

const FREE_CLASSROOM_ONE_CLASS_SNIPPET =
  'Free classroom accounts include one class';

export type ClassManageActionClientError = {
  error: string;
  field?: 'code';
  status: number;
};

export function isClassCodeUniqueViolation(error: unknown): boolean {
  const targets = prismaUniqueConstraintTargets(error);
  return Boolean(targets && uniqueConstraintIncludes(targets, 'code'));
}

export function classManageActionErrorFromCaught(
  error: unknown,
  phase: 'create' | 'update'
): ClassManageActionClientError | null {
  if (error instanceof ClassCodeCollisionError) {
    return {
      error: safeDomainErrorTextForClientResponse(
        error,
        CLASS_CODE_COLLISION_MESSAGE
      ),
      field: 'code',
      status: 400,
    };
  }

  if (
    error instanceof Error &&
    error.message.includes(FREE_CLASSROOM_ONE_CLASS_SNIPPET)
  ) {
    return {
      error: safeDomainErrorTextForClientResponse(
        error,
        `${FREE_CLASSROOM_ONE_CLASS_SNIPPET}. Archive your existing class or upgrade to add another.`
      ),
      status: 403,
    };
  }

  if (isLegacyClassPeriodUniqueViolation(error)) {
    return {
      error: LEGACY_CLASS_PERIOD_UNIQUE_TEACHER_MESSAGE,
      status: 400,
    };
  }

  const uniqueTargets = prismaUniqueConstraintTargets(error);
  if (uniqueTargets) {
    if (uniqueConstraintIncludes(uniqueTargets, 'code')) {
      return {
        error: CLASS_CODE_COLLISION_MESSAGE,
        field: 'code',
        status: 400,
      };
    }
    if (isClassScheduleIdentityUniqueViolation(uniqueTargets)) {
      return {
        error: TEACHER_CLASS_IDENTITY_CONFLICT_MESSAGE,
        status: 400,
      };
    }
    return {
      error:
        phase === 'create'
          ? CLASS_MANAGE_UNKNOWN_UNIQUE_CREATE_MESSAGE
          : CLASS_MANAGE_UNKNOWN_UNIQUE_UPDATE_MESSAGE,
      status: 400,
    };
  }

  return null;
}

function isClassScheduleIdentityUniqueViolation(
  targets: readonly string[]
): boolean {
  const hasSchool = uniqueConstraintIncludes(targets, 'schoolId');
  const hasYear = uniqueConstraintIncludes(targets, 'schoolYear');
  const hasPeriod = uniqueConstraintIncludes(targets, 'period');
  const hasGrade = uniqueConstraintIncludes(targets, 'grade');
  const hasTitle = uniqueConstraintIncludes(targets, 'title');
  return hasSchool && hasYear && (hasPeriod || hasGrade || hasTitle);
}
