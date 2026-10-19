import { expect, mock, test } from 'bun:test';
import * as domain from './teacher-training-admin.server';

test('shared admin writes retain creation order, hard deletion, resource blobs and image replacement', async () => {
  const tx = {
    teacherTraining: {
      count: mock(async () => 3),
      create: mock(async (args: any) => args.data),
      update: mock(async (args: any) => args),
      delete: mock(async (args: any) => args),
    },
    teacherTrainingModule: {
      count: mock(async () => 2),
      create: mock(async (args: any) => args.data),
      update: mock(async (args: any) => args),
      delete: mock(async (args: any) => args),
    },
    teacherTrainingImage: {
      deleteMany: mock(async () => {}),
      create: mock(async (args: any) => args.data),
    },
    teacherTrainingModuleResource: {
      create: mock(async (args: any) => args.data),
      delete: mock(async (args: any) => args),
    },
  };
  expect(
    await domain.createTraining(tx as never, {
      title: 'Training',
      description: null,
    })
  ).toMatchObject({ position: 3 });
  expect(
    await domain.createModule(tx as never, 'tt-1', {
      title: 'Module',
      description: null,
      videoS3Key: 'existing-key',
      videoDuration: 42,
    })
  ).toMatchObject({
    position: 2,
    teacherTrainingId: 'tt-1',
    videoS3Key: 'existing-key',
  });
  await domain.updateTraining(tx as never, 'tt-1', {
    title: 'Updated',
    description: null,
  });
  await domain.updateModule(tx as never, 'm-1', {
    title: 'Updated',
    videoDuration: 5,
  });
  await domain.reorderModules(tx as never, ['m-2', 'm-1']);
  expect(
    tx.teacherTrainingModule.update.mock.calls.slice(-2).map(([a]) => a)
  ).toEqual([
    { where: { id: 'm-2' }, data: { position: 0 } },
    { where: { id: 'm-1' }, data: { position: 1 } },
  ]);
  const blob = Buffer.from('resource bytes');
  await domain.createResource(tx as never, 'm-1', {
    name: 'Guide',
    contentType: 'application/pdf',
    blob,
  });
  expect(
    tx.teacherTrainingModuleResource.create.mock.calls[0]?.[0].data
  ).toMatchObject({ blob, teacherTrainingModuleId: 'm-1' });
  await domain.replaceImage(tx as never, 'tt-1', {
    contentType: 'image/png',
    blob,
  });
  expect(tx.teacherTrainingImage.deleteMany).toHaveBeenCalledWith({
    where: { teacherTrainingId: 'tt-1' },
  });
  await domain.removeImage(tx as never, 'tt-1');
  await domain.deleteResource(tx as never, 'r-1');
  await domain.deleteModule(tx as never, 'm-1');
  await domain.deleteTraining(tx as never, 'tt-1');
  expect(tx.teacherTrainingModule.delete).toHaveBeenCalledWith({
    where: { id: 'm-1' },
  });
  expect(tx.teacherTraining.delete).toHaveBeenCalledWith({
    where: { id: 'tt-1' },
  });
});
