import type { Prisma } from '@app/prisma';
import { describe, expect, test } from 'bun:test';
import {
  buildAssignmentCreationQuotaFields,
  enforceFreeClassroomAssignmentCreateInTransaction,
  FreeClassroomAssignmentQuotaError,
  freeClassroomQuotaMessage,
  isFreeClassroomAssignmentKind,
} from './assignment-quota.server';

describe('assignment-quota helpers', () => {
  test('labels remaining class starters', () => {
    expect(freeClassroomQuotaMessage('class_starter', 8)).toBe(
      '8 of 12 Class Starters left'
    );
    expect(freeClassroomQuotaMessage('class_starter', 0)).toBe(
      "You've used all 12 free Class Starters."
    );
  });

  test('builds quota fields only for free classroom kinds', () => {
    expect(
      buildAssignmentCreationQuotaFields('SCHOOL', 'class_starter', 0)
    ).toEqual({});
    const fields = buildAssignmentCreationQuotaFields(
      'FREE_CLASSROOM',
      'prewriting',
      2
    );
    expect(fields.quotaRemaining).toBe(1);
    expect(fields.quotaExhausted).toBe(false);
    expect(isFreeClassroomAssignmentKind('prewriting')).toBe(true);
    expect(isFreeClassroomAssignmentKind('essay')).toBe(false);
  });
});

describe('enforceFreeClassroomAssignmentCreateInTransaction', () => {
  test('enforces quota from the class org when deploy target is FREE_CLASSROOM', async () => {
    const tx = {
      class: {
        findMany: async () => [
          {
            id: 'class-free',
            school: {
              organization: {
                id: 'preview-free-classroom',
                plan: 'FREE_CLASSROOM',
              },
            },
          },
        ],
      },
      assignmentType: {
        findUnique: async () => ({ kind: 'prewriting' }),
      },
      $executeRawUnsafe: async () => {},
      freeClassroomAssignmentKindUsage: {
        findUnique: async () => ({ lifetimeCreatedCount: 3 }),
      },
    } as unknown as Prisma.TransactionClient;

    await expect(
      enforceFreeClassroomAssignmentCreateInTransaction(tx, {
        classIds: ['class-free'],
        assignmentTypeId: 'type-prewriting',
      })
    ).rejects.toBeInstanceOf(FreeClassroomAssignmentQuotaError);
  });

  test('skips quota work when deploy-target org is SCHOOL', async () => {
    let assignmentTypeLookups = 0;
    const tx = {
      class: {
        findMany: async () => [
          {
            id: 'class-school',
            school: {
              organization: { id: 'local-dev-org', plan: 'SCHOOL' },
            },
          },
        ],
      },
      assignmentType: {
        findUnique: async () => {
          assignmentTypeLookups += 1;
          return { kind: 'prewriting' };
        },
      },
    } as unknown as Prisma.TransactionClient;

    await enforceFreeClassroomAssignmentCreateInTransaction(tx, {
      classIds: ['class-school'],
      assignmentTypeId: 'type-prewriting',
    });
    expect(assignmentTypeLookups).toBe(0);
  });
});
