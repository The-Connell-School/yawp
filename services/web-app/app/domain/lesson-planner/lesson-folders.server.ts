/**
 * Folders in the library that the teacher makes and fills (Kevin, Oct 23).
 *
 * A folder is a unit: the same container the planner fills with a week's day
 * lessons, so a folder the teacher makes and one the planner makes behave
 * the same. A lesson's place in its folder is its `unitDay`. Every write is
 * scoped to the teacher; a lesson or folder of anyone else's is not found.
 */
import { prisma } from '~/utils/db.server';

export type FolderScope = { membershipId: string; organizationId: string };

const MAX_TITLE = 120;

function folderName(title: string): string {
  return title.replace(/\s+/g, ' ').trim().slice(0, MAX_TITLE) || 'New folder';
}

async function ownedFolder(scope: FolderScope, folderId: string) {
  return prisma.lessonPlanUnit.findFirst({
    where: { id: folderId, membershipId: scope.membershipId, deletedAt: null },
    select: { id: true },
  });
}

async function ownedLesson(scope: FolderScope, conversationId: string) {
  return prisma.lessonPlanConversation.findFirst({
    where: { id: conversationId, membershipId: scope.membershipId, deletedAt: null },
    select: { id: true, unitId: true },
  });
}

export async function createFolder(scope: FolderScope, title: string) {
  return prisma.lessonPlanUnit.create({
    data: { membershipId: scope.membershipId, organizationId: scope.organizationId, title: folderName(title) },
    select: { id: true, title: true },
  });
}

export async function renameFolder(scope: FolderScope, folderId: string, title: string): Promise<boolean> {
  if (!(await ownedFolder(scope, folderId))) return false;
  await prisma.lessonPlanUnit.update({ where: { id: folderId }, data: { title: folderName(title) } });
  return true;
}

/** The folder goes; its lessons stay, standing on their own again. */
export async function deleteFolder(scope: FolderScope, folderId: string): Promise<boolean> {
  if (!(await ownedFolder(scope, folderId))) return false;
  await prisma.$transaction([
    prisma.lessonPlanConversation.updateMany({
      where: { unitId: folderId, membershipId: scope.membershipId },
      data: { unitId: null, unitDay: null },
    }),
    prisma.lessonPlanUnit.update({ where: { id: folderId }, data: { deletedAt: new Date() } }),
  ]);
  return true;
}

/** Into a folder, at its end; or out of any folder with `folderId` null. */
export async function moveLesson(
  scope: FolderScope,
  conversationId: string,
  folderId: string | null
): Promise<boolean> {
  const lesson = await ownedLesson(scope, conversationId);
  if (!lesson) return false;
  if (!folderId) {
    await prisma.lessonPlanConversation.update({ where: { id: lesson.id }, data: { unitId: null, unitDay: null } });
    return true;
  }
  if (!(await ownedFolder(scope, folderId))) return false;
  if (lesson.unitId === folderId) return true;
  const last = await prisma.lessonPlanConversation.aggregate({
    where: { unitId: folderId, deletedAt: null },
    _max: { unitDay: true },
  });
  await prisma.lessonPlanConversation.update({
    where: { id: lesson.id },
    data: { unitId: folderId, unitDay: (last._max.unitDay ?? 0) + 1 },
  });
  return true;
}

/** The folder's lessons in this order: the first is 1. Others are left as they are. */
export async function reorderFolder(scope: FolderScope, folderId: string, conversationIds: string[]): Promise<boolean> {
  if (!(await ownedFolder(scope, folderId))) return false;
  const members = await prisma.lessonPlanConversation.findMany({
    where: { unitId: folderId, membershipId: scope.membershipId, deletedAt: null, unitDay: { not: null } },
    select: { id: true },
  });
  const inFolder = new Set(members.map((member) => member.id));
  const order = conversationIds.filter((id) => inFolder.has(id));
  await prisma.$transaction(
    order.map((id, index) => prisma.lessonPlanConversation.update({ where: { id }, data: { unitDay: index + 1 } }))
  );
  return true;
}
