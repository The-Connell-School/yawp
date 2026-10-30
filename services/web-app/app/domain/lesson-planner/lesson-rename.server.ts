/**
 * Rename a lesson the teacher owns (Oct 24 handoff, task 8). The stack page
 * and the library both call this, so a rename in one is the name in both.
 */
import { prisma } from '~/utils/db.server';
import { renameFields } from './lesson-rename';

export async function renameLesson({
  conversationId,
  membershipId,
  name,
}: {
  conversationId: string;
  membershipId: string;
  name: string;
}): Promise<{ title: string; originalTitle: string | null } | null> {
  const current = await prisma.lessonPlanConversation.findFirst({
    where: { id: conversationId, membershipId, deletedAt: null },
    select: { title: true, packetTitle: true, originalTitle: true },
  });
  if (!current) return null;
  const next = renameFields(current, name);
  if (!next) return null;
  await prisma.lessonPlanConversation.update({ where: { id: conversationId }, data: next });
  return { title: next.title, originalTitle: next.originalTitle };
}
