import { expect, mock, test } from 'bun:test';

const userHasPendingFreeTierTeachingLock = mock(async () => true);

mock.module('./locked-preview.server', () => ({
  userHasPendingFreeTierTeachingLock,
}));

const { redirectLockedPreviewAssignmentTypeHomeToGuide } = await import(
  './locked-preview-assignment-type-routing.server'
);

async function expectRedirect(
  run: () => Promise<unknown>,
  location: string
) {
  try {
    await run();
    throw new Error('expected redirect');
  } catch (error) {
    expect(error).toBeInstanceOf(Response);
    const response = error as Response;
    expect(response.status).toBeGreaterThanOrEqual(300);
    expect(response.status).toBeLessThan(400);
    expect(response.headers.get('Location')).toBe(location);
  }
}

test('redirectLockedPreviewAssignmentTypeHomeToGuide sends pending teachers to How It Works', async () => {
  userHasPendingFreeTierTeachingLock.mockResolvedValue(true);
  await expectRedirect(
    () =>
      redirectLockedPreviewAssignmentTypeHomeToGuide({
        userId: 'u1',
        assignmentType: {
          id: 'at-class-starter',
          title: 'Class Starter',
          kind: 'class_starter',
        },
      }),
    '/app/assignment-types/at-class-starter/how-it-works'
  );
});

test('redirectLockedPreviewAssignmentTypeHomeToGuide is a no-op when approved', async () => {
  userHasPendingFreeTierTeachingLock.mockResolvedValue(false);
  await redirectLockedPreviewAssignmentTypeHomeToGuide({
    userId: 'u1',
    assignmentType: {
      id: 'at-class-starter',
      title: 'Class Starter',
      kind: 'class_starter',
    },
  });
});
