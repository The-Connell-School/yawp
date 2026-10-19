import { expect, mock, test } from 'bun:test';
const requireAdmin = mock(async (_request: Request) => {});
const prisma = {
  $transaction: async (fn: any) => fn(prisma),
  teacherTraining: {
    count: mock(async () => 3),
    create: mock(async () => ({ id: 'tt-new' })),
    update: mock(async (_args: any) => ({})),
    delete: mock(async (_args: any) => ({})),
  },
  teacherTrainingModule: {
    count: mock(async () => 2),
    create: mock(async (_args: any) => ({})),
    update: mock(async (_args: any) => ({})),
    delete: mock(async (_args: any) => ({})),
  },
  teacherTrainingImage: {
    deleteMany: mock(async (_args: any) => ({})),
    create: mock(async (_args: any) => ({})),
  },
  teacherTrainingModuleResource: {
    create: mock(async (_args: any) => ({})),
    delete: mock(async (_args: any) => ({})),
  },
};
const sendEmail = mock(async () => {
  throw new Error('Training tests must not send email');
});
mock.module('~/utils/email.server', () => ({ sendEmail }));
mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/auth.server', () => ({
  requireAdmin,
  requireUserId: async () => 'admin-1',
  getUserId: async () => 'admin-1',
}));
const index = await import('~/routes/app.admin.teacher-trainings._index/route');
const training = await import('~/routes/app.admin.teacher-trainings.$id/route');
const module =
  await import('~/routes/app.admin.teacher-trainings.$id_.modules_.$moduleId/route');
async function call(route: any, fields: Record<string, string | File>) {
  const body = new FormData();
  for (const [name, value] of Object.entries(fields)) body.set(name, value);
  return route.action({
    request: new Request('https://yawp.test/app/admin/teacher-trainings/tt-1', {
      method: 'POST',
      body,
    }),
    params: { id: 'tt-1', moduleId: 'm-1' },
  });
}
test('existing admin forms preserve redirects, validation, video keys and blob writes through shared domain', async () => {
  expect(
    (
      await call(index, {
        intent: 'create',
        title: 'Training',
        description: '',
      })
    ).headers.get('location')
  ).toBe('/app/admin/teacher-trainings/tt-new');
  expect(
    (await call(training, { intent: 'deleteCourse' })).headers.get('location')
  ).toBe('/app/admin/teacher-trainings');
  await call(training, {
    intent: 'updateCourse',
    title: 'Updated',
    description: '',
  });
  expect(prisma.teacherTraining.update).toHaveBeenCalledWith({
    where: { id: 'tt-1' },
    data: { title: 'Updated', description: null },
  });
  await call(training, {
    intent: 'updateCourse',
    title: 'Updated',
    deleteImage: 'true',
  });
  expect(prisma.teacherTrainingImage.deleteMany).toHaveBeenCalledWith({
    where: { teacherTrainingId: 'tt-1' },
  });
  await call(training, {
    intent: 'createModule',
    title: 'Module',
    video: new File(['video'], 'intro.mp4', { type: 'video/mp4' }),
    videoS3Key: 'existing-key',
    videoDuration: '42.8',
  });
  expect(prisma.teacherTrainingModule.create).toHaveBeenCalledWith({
    data: {
      title: 'Module',
      description: null,
      videoS3Key: 'existing-key',
      videoDuration: 42,
      position: 2,
      teacherTrainingId: 'tt-1',
    },
  });
  expect(
    (await call(module, { intent: 'updateModule', title: 'Module' })).status
  ).toBe(400);
  await call(module, {
    intent: 'updateModule',
    title: 'Module',
    videoS3Key: 'replacement-key',
    videoDuration: '12.8',
  });
  expect(prisma.teacherTrainingModule.update).toHaveBeenCalledWith({
    where: { id: 'm-1' },
    data: {
      title: 'Module',
      description: null,
      videoS3Key: 'replacement-key',
      videoDuration: 12,
    },
  });
  await call(module, {
    intent: 'uploadResources',
    resources: new File(['%PDF-1.7'], 'guide.pdf', { type: 'application/pdf' }),
  });
  expect(
    prisma.teacherTrainingModuleResource.create.mock.calls[0]?.[0].data
  ).toMatchObject({
    name: 'guide.pdf',
    contentType: 'application/pdf',
    blob: Buffer.from('%PDF-1.7'),
    teacherTrainingModuleId: 'm-1',
  });
  await call(module, { intent: 'deleteResource', resourceId: 'r-1' });
  expect(prisma.teacherTrainingModuleResource.delete).toHaveBeenCalledWith({
    where: { id: 'r-1' },
  });
  expect(
    (await call(module, { intent: 'deleteModule' })).headers.get('location')
  ).toBe('/app/admin/teacher-trainings/tt-1');
  expect(requireAdmin).toHaveBeenCalledTimes(10);
  requireAdmin.mockImplementationOnce(async () => {
    throw new Response('Forbidden', { status: 403 });
  });
  await expect(
    call(index, { intent: 'create', title: 'Blocked' })
  ).rejects.toBeInstanceOf(Response);
  expect(prisma.teacherTraining.create).toHaveBeenCalledTimes(1);
});

test('training writes never send email', () => {
  expect(sendEmail).not.toHaveBeenCalled();
});
