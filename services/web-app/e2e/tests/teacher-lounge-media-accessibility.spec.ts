import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';

const RESOURCE_NAMES = [
  'e2e-module-handout.pdf',
  'e2e-captions.vtt',
  'e2e-transcript.md',
];

async function seedModuleResources(params: {
  teacherTrainingId: string;
}): Promise<{ moduleId: string }> {
  const prisma = createE2EPrismaClient();
  try {
    const module = await prisma.teacherTrainingModule.findFirstOrThrow({
      where: {
        teacherTrainingId: params.teacherTrainingId,
        title: 'E2E Lounge Module',
      },
      select: { id: true },
    });

    await prisma.teacherTrainingModuleResource.deleteMany({
      where: {
        teacherTrainingModuleId: module.id,
        name: { in: RESOURCE_NAMES },
      },
    });

    await prisma.teacherTrainingModuleResource.createMany({
      data: [
        {
          teacherTrainingModuleId: module.id,
          name: 'e2e-module-handout.pdf',
          contentType: 'application/pdf',
          blob: Buffer.from('E2E handout'),
        },
        {
          teacherTrainingModuleId: module.id,
          name: 'e2e-captions.vtt',
          contentType: 'text/vtt',
          blob: Buffer.from(
            'WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nHello from captions.\n'
          ),
        },
        {
          teacherTrainingModuleId: module.id,
          name: 'e2e-transcript.md',
          contentType: 'text/markdown',
          blob: Buffer.from('# Transcript\n\nHello from the transcript.\n'),
        },
      ],
    });

    return { moduleId: module.id };
  } finally {
    await prisma.$disconnect();
  }
}

test('Teacher Lounge module keeps media accessibility links below primary resources', async ({
  page,
  signIn,
  e2eContext,
}) => {
  const { moduleId } = await seedModuleResources({
    teacherTrainingId: e2eContext.teacherTrainingId,
  });

  await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
  await page.goto(
    `/app/teacher-trainings/${e2eContext.teacherTrainingId}/modules/${moduleId}`
  );

  await expect(
    page.getByRole('heading', { name: 'E2E Lounge Module' }).first()
  ).toBeVisible();

  const resourcesSection = page.getByTestId(
    'teacher-training-primary-resources'
  );
  const mediaSection = page.getByTestId('teacher-training-media-accessibility');

  await expect(resourcesSection).toBeVisible();
  await expect(mediaSection).toBeVisible();

  await expect(
    resourcesSection.getByText('e2e-module-handout.pdf')
  ).toBeVisible();
  await expect(resourcesSection.getByText('e2e-captions.vtt')).toHaveCount(0);
  await expect(resourcesSection.getByText('e2e-transcript.md')).toHaveCount(0);

  await expect(
    mediaSection.getByRole('link', { name: /^captions$/i })
  ).toBeVisible();
  await expect(
    mediaSection.getByRole('link', { name: /^transcript$/i })
  ).toBeVisible();

  const resourcesBox = await resourcesSection.boundingBox();
  const mediaBox = await mediaSection.boundingBox();
  expect(resourcesBox).not.toBeNull();
  expect(mediaBox).not.toBeNull();
  expect(mediaBox!.y).toBeGreaterThan(
    resourcesBox!.y + resourcesBox!.height - 1
  );

  const helperClasses = await mediaSection.getAttribute('class');
  expect(helperClasses).toContain('text-xs');
  expect(helperClasses).toContain('text-muted-foreground');

  const helperFontSize = await mediaSection.evaluate((node) =>
    Number.parseFloat(getComputedStyle(node).fontSize)
  );
  const resourceFontSize = await resourcesSection
    .getByText('e2e-module-handout.pdf')
    .evaluate((node) => Number.parseFloat(getComputedStyle(node).fontSize));
  expect(helperFontSize).toBeLessThan(resourceFontSize);
});
