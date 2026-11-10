import { beforeEach, describe, expect, mock, test } from 'bun:test';
import type { Flow } from './flow.server';

const classes: Array<{
  id: string;
  code: string;
  title: string;
  grade: null;
  period: null;
  studentJoinToken: null;
  school: {
    name: string;
    organizationId: string;
    organization: { plan: 'SCHOOL' };
  };
  teachers: { user: { name: string } }[];
}> = [];

const tx = {
  class: {
    findMany: mock(async () => classes),
    findFirst: mock(async () => classes[0] ?? null),
  },
};
mock.module('~/domain/free-tier/class-seat-cap.server', () => ({
  assertFreeClassSeatAvailableInTx: async () => ({ ok: true }),
}));

const flow = (): Flow => ({
  id: 'flow-id',
  browser: 'browser',
  token: 'token',
  data: {
    destination: '/app',
    state: { screen: 'class-code', flowToken: 'token' },
  },
});

let resolveStudentClassCodeMock = mock(
  async (_tx: unknown, _organizationId: unknown, _code: unknown) =>
    [] as { id: string }[]
);
mock.module('~/domain/free-tier/existing-student-enrollment.server', () => ({
  resolveStudentClassCode: (
    tx: unknown,
    organizationId: unknown,
    code: unknown
  ) => resolveStudentClassCodeMock(tx, organizationId, code),
}));

const {
  resolveClasses,
  resolveClassesForExistingStudent,
  crossTenantClassCodeCollisionError,
} = await import('./classes.server');

function klass(id: string, org: string, code = 'SHARED') {
  return {
    id,
    code,
    title: `Class ${id}`,
    grade: null,
    period: null,
    studentJoinToken: null,
    school: {
      name: `School ${org}`,
      organizationId: org,
      organization: { plan: 'SCHOOL' as const },
    },
    teachers: [{ user: { name: `Teacher ${org}` } }],
  };
}

beforeEach(() => {
  classes.length = 0;
  resolveStudentClassCodeMock = mock(async () => []);
  tx.class.findMany.mockClear();
  tx.class.findFirst.mockClear();
});

describe('resolveClasses', () => {
  test('rejects cross-organization code collisions without exposing foreign class metadata', async () => {
    classes.push(klass('a', 'org-a'), klass('b', 'org-b'));
    await expect(resolveClasses(tx as any, flow(), 'SHARED')).rejects.toMatchObject(
      { message: crossTenantClassCodeCollisionError().message }
    );
  });

  test('keeps same-organization ambiguity for logged-out class-code entry', async () => {
    classes.push(klass('a1', 'org-a'), klass('a2', 'org-a'));
    const result = await resolveClasses(tx as any, flow(), 'SHARED');
    expect(result.state.variant).toBe('multiple');
    expect(result.state.classes?.map((c) => c.id).sort()).toEqual(['a1', 'a2']);
  });

  test('keeps single-match class resolution unchanged', async () => {
    classes.push(klass('only', 'org-a', 'UNIQUE'));
    const result = await resolveClasses(tx as any, flow(), 'UNIQUE');
    expect(result.state.screen).toBe('class-found');
    expect(result.state.classInfo?.id).toBe('only');
  });
});

describe('resolveClassesForExistingStudent', () => {
  test('surfaces only org-scoped matches from resolveStudentClassCode', async () => {
    resolveStudentClassCodeMock = mock(async () => [{ id: 'scoped' }]);
    classes.push(klass('scoped', 'org-home'));
    const result = await resolveClassesForExistingStudent(
      tx as any,
      flow(),
      'SHARED',
      'org-home'
    );
    expect(result.state.classInfo?.id).toBe('scoped');
    expect(resolveStudentClassCodeMock).toHaveBeenCalledWith(
      tx,
      'org-home',
      'SHARED'
    );
  });

  test('falls back to global resolution when org-scoped lookup is empty', async () => {
    classes.push(klass('only', 'org-a', 'UNIQUE'));
    const result = await resolveClassesForExistingStudent(
      tx as any,
      flow(),
      'UNIQUE',
      'org-home'
    );
    expect(result.state.classInfo?.id).toBe('only');
  });
});
