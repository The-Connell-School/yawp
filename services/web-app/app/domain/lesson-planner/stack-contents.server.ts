/**
 * What is in a lesson's stack, in full and in lesson order (Brian's review,
 * B6), so the planner can build a deck, handout, or plan from exactly the
 * pieces the teacher kept.
 */
import { prisma } from '~/utils/db.server';
import type { StackContentsEntry } from '~/routes/api.domain.lesson-planner/build-system-prompt';
import { deriveSectionTitle } from './lesson-packet';
import { orderStackEntries } from './stack-order';
import { hidePromptIds } from './prompt-ids';

export async function loadStackContents(
  conversationId: string,
  {
    /**
     * Building or rebuilding a deck (Brian's run 2, C1): the old deck is not
     * a piece to build from, and feeding it back seeds the new deck with
     * whatever drifted into the old one.
     */
    leaveOutDeck = false,
  }: { leaveOutDeck?: boolean } = {}
): Promise<StackContentsEntry[]> {
  const [kept, materials] = await Promise.all([
    prisma.lessonPlanMessage.findMany({
      where: { conversationId, role: 'assistant', keptAt: { not: null } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: {
        createdAt: true,
        content: true,
        keptTitle: true,
        position: true,
      },
    }),
    prisma.lessonPlanMaterial.findMany({
      where: leaveOutDeck
        ? { conversationId, NOT: { kind: 'slides' } }
        : { conversationId },
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
        content: hidePromptIds(message.content),
      },
    })),
    ...materials
      .filter((material) => !leaveOutDeck || material.kind !== 'slides')
      .map((material) => ({
        at: material.sourceCreatedAt.getTime(),
        order: 1,
        position: material.position,
        item: {
          kind: material.kind,
          title: material.title,
          // The model echoed "Class Starter prompt FW-021" back at teachers
          // because it read it here (Brian's run 2, item 26).
          content: hidePromptIds(material.content),
        },
      })),
  ]);
}
