import { describe, expect, test } from 'bun:test';
import {
  buildInternAccounts,
  buildTesterGrantPlan,
  buildUserTesterFlags,
  parseDemoInternArgs,
} from './create-intern-testers-lib';

const passwords = {
  INTERN_PASSWORD_1: 'one-password',
  INTERN_PASSWORD_2: 'two-password',
  INTERN_PASSWORD_3: 'three-password',
  INTERN_PASSWORD_4: 'four-password',
};

describe('demo intern account input', () => {
  test('allows either real reconcile with no args or dry-run', () => {
    expect(parseDemoInternArgs([])).toEqual({ dryRun: false });
    expect(parseDemoInternArgs(['--dry-run'])).toEqual({ dryRun: true });
    expect(() => parseDemoInternArgs(['--dry-run', '--dry-run'])).toThrow(
      'Usage'
    );
    expect(() => parseDemoInternArgs(['--apply'])).toThrow('Usage');
  });

  test('builds exactly four accounts and keeps password values out of errors', () => {
    const accounts = buildInternAccounts(passwords);

    expect(accounts.map((account) => account.email)).toEqual([
      'bryant+intern1@brock.software',
      'bryant+intern2@brock.software',
      'bryant+intern3@brock.software',
      'bryant+intern4@brock.software',
    ]);

    expect(() =>
      buildInternAccounts({
        ...passwords,
        INTERN_PASSWORD_3: '   ',
      })
    ).toThrow('INTERN_PASSWORD_3 is required.');
  });
});

describe('demo intern tester markers', () => {
  test('sets supported user flags from Prisma DMMF', () => {
    const flags = buildUserTesterFlags({
      datamodel: {
        models: [
          {
            name: 'User',
            fields: [
              { name: 'isTester', type: 'Boolean' },
              { name: 'mockAdminGranted', type: 'Boolean' },
              { name: 'testerRole', kind: 'enum', type: 'TesterRole' },
            ],
          },
        ],
        enums: [
          {
            name: 'TesterRole',
            values: [{ name: 'OBSERVER' }, { name: 'MOCK_ADMIN' }],
          },
        ],
      },
    });

    expect(flags.data).toEqual({
      isTester: true,
      mockAdminGranted: true,
      testerRole: 'MOCK_ADMIN',
    });
    expect(flags.warnings).toEqual([]);
  });

  test('plans a TesterGrant write when a compatible table exists', () => {
    const plan = buildTesterGrantPlan({
      datamodel: {
        models: [
          {
            name: 'TesterGrant',
            fields: [
              { name: 'id', type: 'String', isRequired: true, hasDefaultValue: true },
              { name: 'userId', type: 'String', isRequired: true },
              { name: 'kind', kind: 'enum', type: 'TesterGrantKind', isRequired: true },
              { name: 'enabled', type: 'Boolean', isRequired: true },
            ],
            uniqueFields: [['userId', 'kind']],
          },
        ],
        enums: [
          {
            name: 'TesterGrantKind',
            values: [{ name: 'MOCK_ADMIN' }],
          },
        ],
      },
    });

    expect(plan).toEqual({
      delegateName: 'testerGrant',
      where: {
        userId_kind: {
          userId: 'user-id',
          kind: 'MOCK_ADMIN',
        },
      },
      create: {
        userId: 'user-id',
        kind: 'MOCK_ADMIN',
        enabled: true,
      },
      update: {
        enabled: true,
      },
    });
  });
});
