import type { Prisma } from '@app/prisma';

// These writes are shared by the existing admin forms and the signed operator API.
type Db = Pick<
  Prisma.TransactionClient,
  | 'teacherTraining'
  | 'teacherTrainingModule'
  | 'teacherTrainingImage'
  | 'teacherTrainingModuleResource'
>;
export async function createTraining(
  db: Db,
  fields: { title: string; description?: string | null }
) {
  const position = await db.teacherTraining.count();
  return db.teacherTraining.create({ data: { ...fields, position } });
}
export function updateTraining(
  db: Db,
  id: string,
  fields: Prisma.TeacherTrainingUpdateInput
) {
  return db.teacherTraining.update({ where: { id }, data: fields });
}
export function deleteTraining(db: Db, id: string) {
  // Preserve the admin's hard delete and the existing cascading relations.
  return db.teacherTraining.delete({ where: { id } });
}
export async function createModule(
  db: Db,
  teacherTrainingId: string,
  fields: {
    title: string;
    description?: string | null;
    videoS3Key?: string | null;
    videoDuration?: number | null;
  },
  position?: number
) {
  const appended =
    position ??
    (await db.teacherTrainingModule.count({ where: { teacherTrainingId } }));
  return db.teacherTrainingModule.create({
    data: { ...fields, teacherTrainingId, position: appended },
  });
}
export function updateModule(
  db: Db,
  id: string,
  fields: Prisma.TeacherTrainingModuleUpdateInput
) {
  return db.teacherTrainingModule.update({ where: { id }, data: fields });
}
export function deleteModule(db: Db, id: string) {
  return db.teacherTrainingModule.delete({ where: { id } });
}
export async function reorderModules(db: Db, ids: string[]) {
  await Promise.all(
    ids.map((id, position) =>
      db.teacherTrainingModule.update({ where: { id }, data: { position } })
    )
  );
}
export function removeImage(db: Db, teacherTrainingId: string) {
  return db.teacherTrainingImage.deleteMany({ where: { teacherTrainingId } });
}
export async function replaceImage(
  db: Db,
  teacherTrainingId: string,
  image: {
    blob: Buffer<ArrayBuffer>;
    contentType: string;
    altText?: string | null;
  },
  selection: { select?: Prisma.TeacherTrainingImageSelect } = {}
) {
  await removeImage(db, teacherTrainingId);
  return db.teacherTrainingImage.create({
    data: { ...image, teacherTrainingId },
    ...selection,
  });
}
export function createResource(
  db: Db,
  teacherTrainingModuleId: string,
  fields: { name: string; contentType: string; blob: Buffer<ArrayBuffer> },
  selection: { select?: Prisma.TeacherTrainingModuleResourceSelect } = {}
) {
  return db.teacherTrainingModuleResource.create({
    data: { ...fields, teacherTrainingModuleId },
    ...selection,
  });
}
export function deleteResource(
  db: Db,
  id: string,
  selection: { select?: Prisma.TeacherTrainingModuleResourceSelect } = {}
) {
  return db.teacherTrainingModuleResource.delete({ where: { id }, ...selection });
}
