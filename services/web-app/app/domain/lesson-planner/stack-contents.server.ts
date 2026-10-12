/**
 * What is in a lesson's stack, in full and in lesson order (Brian's review,
 * B6), so the planner can build a deck, handout, or plan from exactly the
 * pieces the teacher kept.
 */
import { prisma } from '~/utils/db.server';
import type { StackContentsEntry } from '~/routes/api.domain.lesson-planner/build-system-prompt';
import { deriveSectionTitle } from './lesson-packet';
import { orderStackEntries } from './stack-order';

export async function loadStackContents(
  conversationId: string
): Promise<StackContentsEntry[]> {
  const [kept, materials] = await Promise.all([
    prisma.lessonPlanMessage.findMany({
      where: { conversationId, role: 'assistant', keptAt: { not: null } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { createdAt: true, content: true, keptTitle: true, position: true },
    }),
    prisma.lessonPlanMaterial.findMany({
      where: { conversationId },
      orderBy: [{ sourceCreatedAt: 'asc' }, { blockKey: 'asc' }],
      select: {
        sourceCreatedAt: true,
        kind: true,
        title: true,
        content: true,
        position: true,
      },
    }),
  ]);

  // The teacher's order once they have set one (Brian's run 2, A1): a deck
  // built from the stack follows the sequence they chose.
  return orderStackEntries([
    ...kept.map((message, index) => ({
      at: message.createdAt.getTime(),
      order: 0,
      position: message.position,
      item: {
        kind: 'lesson',
        title: message.keptTitle ?? deriveSectionTitle(message.content, index),
        content: message.content,
      },
    })),
    ...materials.map((material) => ({
      at: material.sourceCreatedAt.getTime(),
      order: 1,
      position: material.position,
      item: {
        kind: material.kind,
        title: material.title,
        content: material.content,
      },
    })),
  ]);
}
