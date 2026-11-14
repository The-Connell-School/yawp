import { test, expect } from '../test-setup';

test.describe('AP History library-first flow (retired)', () => {
  test('teacher home does not offer AP History Essay', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto('/app');
    await expect(
      page.getByRole('link', { name: 'AP History Essay' })
    ).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'New AP History Essay assignment' })
    ).toHaveCount(0);
  });

  test('AP History assignment type page is not reachable', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    const response = await page.goto(
      `/app/assignment-types/${e2eContext.apHistoryAssignmentTypeId}`
    );
    expect(response?.status()).toBe(404);
  });

  test('AP History extract API returns not found', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    const response = await page.request.post(
      '/api/ap-history/extract-document',
      {
        multipart: {
          file: {
            name: 'dbq.pdf',
            mimeType: 'application/pdf',
            buffer: Buffer.from('%PDF-1.4 fake'),
          },
        },
      }
    );
    expect(response.status()).toBe(404);
  });
});