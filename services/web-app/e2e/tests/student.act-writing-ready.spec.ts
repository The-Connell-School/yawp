import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';
import { createDeployedAssignment } from '../db-helpers';

test.describe.serial('ACT Writing Ready advancement', () => {
  test('Ready advances to the next ordered instruction without duplicating the opening prompt', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    const prisma = createE2EPrismaClient();
    const suffix = Date.now();
    const firstPrompt = `ACT Writing first instruction ${suffix}`;
    const readyPrompt = `ACT Writing ready instruction ${suffix}`;
    const writingPrompt = `ACT Writing draft instruction ${suffix}`;
    let assignmentTypeId: string | undefined;

    try {
      const assignmentType = await prisma.assignmentType.create({
        data: {
          title: `ACT Writing E2E ${suffix}`,
          description: 'E2E fixture for ACT Writing Ready advancement.',
          position: 9000,
          ownerOrgId: e2eContext.organizationId,
          organizationAssignments: {
            create: { organizationId: e2eContext.organizationId },
          },
          assignmentModules: {
            create: [
              {
                title: 'ACT Writing',
                position: 1,
                description: 'ACT Writing student flow.',
                instructions: {
                  create: [
                    {
                      title: 'Ready to draft',
                      prompt: readyPrompt,
                      position: 2,
                      showChatButton: false,
                      showNextButton: false,
                    },
                    {
                      title: 'Opening instructions',
                      prompt: firstPrompt,
                      position: 1,
                      showChatButton: false,
                      showNextButton: false,
                      buttons: {
                        create: [
                          {
                            label: 'Ready',
                            action: 'advance',
                            position: 1,
                          },
                        ],
                      },
                    },
                    {
                      title: 'Draft',
                      prompt: writingPrompt,
                      position: 3,
                      showChatButton: true,
                      showNextButton: false,
                    },
                  ],
                },
              },
            ],
          },
        },
        select: { id: true },
      });
      assignmentTypeId = assignmentType.id;

      const { assignment } = await createDeployedAssignment({
        prisma,
        classId: e2eContext.classId,
        assignmentTypeId: assignmentType.id,
        title: `ACT Writing Ready E2E ${suffix}`,
        prompt: `ACT Writing prompt ${suffix}`,
      });

      await signIn(e2eContext.userEmail, 'johndoe');
      await page.goto(`/app/my-classes/${e2eContext.classId}`);
      await expect(page.getByTestId('student-class-detail')).toBeVisible();

      await page
        .getByRole('button', { name: `ACT Writing Ready E2E ${suffix}` })
        .click();
      await page.waitForURL('**/app/documents/**', { timeout: 15000 });

      const tutorMessages = page.locator('[data-tutor-message="true"]');
      await expect(tutorMessages.filter({ hasText: firstPrompt })).toHaveCount(
        1
      );
      await expect(tutorMessages.filter({ hasText: readyPrompt })).toHaveCount(
        0
      );

      await page.getByRole('button', { name: 'Ready' }).click();

      await expect(tutorMessages.filter({ hasText: readyPrompt })).toHaveCount(
        1
      );
      await expect(tutorMessages.filter({ hasText: firstPrompt })).toHaveCount(
        1
      );
      await expect(tutorMessages.filter({ hasText: writingPrompt })).toHaveCount(
        0
      );

      await prisma.assignment.delete({ where: { id: assignment.id } });
    } finally {
      if (assignmentTypeId) {
        await prisma.assignment.deleteMany({ where: { assignmentTypeId } });
        await prisma.document.deleteMany({ where: { assignmentTypeId } });
        await prisma.assignmentType.deleteMany({
          where: { id: assignmentTypeId },
        });
      }
      await prisma.$disconnect();
    }
  });
});
