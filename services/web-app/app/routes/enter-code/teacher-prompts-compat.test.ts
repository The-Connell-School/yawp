import { expect, mock, test } from 'bun:test';

mock.module('~/utils/db.server', () => ({ prisma: {} }));
mock.module('~/utils/auth.server', () => ({
  requireUserId: async () => 'student',
  requireMembership: async () => ({
    id: 'membership',
    role: 'STUDENT',
    organization: { id: 'organization' },
  }),
}));
mock.module('~/domain/feature-flags/feature-flags.server', () => ({
  isFeatureFlagEnabled: async () => true,
}));
mock.module('~/domain/free-tier/existing-student-enrollment.server', () => ({
  resolveStudentClassCode: async () => [{ id: 'class' }],
  enrollExistingStudentByCode: mock(),
}));
const { loader } = await import('./route');

test('flag on preserves a legacy class-selection continuation', async () => {
  const result = await loader({
    request: new Request('http://localhost/enter-code?code=VALIDATED'),
    params: {},
    context: {},
  } as Parameters<typeof loader>[0]);
  expect(result.data).toMatchObject({
    code: 'VALIDATED',
    classes: [{ id: 'class' }],
  });
  expect(result.data).not.toHaveProperty('teacherPromptEntry');
});

test('flag on preserves the existing dashboard modal loader', async () => {
  const result = await loader({
    request: new Request('http://localhost/enter-code?modal=1'),
    params: {},
    context: {},
  } as Parameters<typeof loader>[0]);
  expect(result.data).toMatchObject({ code: null, classes: [] });
  expect(result.data).not.toHaveProperty('teacherPromptEntry');
});
