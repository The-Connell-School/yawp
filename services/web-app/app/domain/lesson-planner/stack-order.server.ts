/**
 * Reading and writing the order of a lesson's stack (Brian's run 2, A1).
 *
 * Every write gives every piece its place in one transaction, so a stack is
 * either untouched (all places null, read in written order) or fully placed.
 */
import { prisma } from '~/utils/db.server';
import {
  nextStackPosition,
  orderStackEntries,
  parseStackEntryKey,
  stackEntryKey,
} from './stack-order';

type Placed = { key: string; position: number | null };

async function readStack(conversationId: string) {
  const [kept, materials] = await Promise.all([
    prisma.lessonPlanMessage.findMany({
      where: { conversationId, role: 'assistant', keptAt: { not: null } },
      select: { id: true, createdAt: true, position: true },
    }),
    prisma.lessonPlanMaterial.findMany({
      where: { conversationId },
      select: { id: true, sourceCreatedAt: true, position: true },
    }),
  ]);
  return orderStackEntries<Placed>([
    ...kept.map((message) => ({
      at: message.createdAt.getTime(),
      order: 0,
      position: message.position,
      item: {
        key: stackEntryKey({ origin: 'reply', id: message.id }),
        position: message.position,
      },
    })),
    ...materials.map((material) => ({
      at: material.sourceCreatedAt.getTime(),
      order: 1,
      position: material.position,
      item: {
        key: stackEntryKey({ origin: 'material', id: material.id }),
        position: material.position,
      },
    })),
  ]);
}

/** The stack's pieces as "m:<id>" / "r:<id>" keys, in the order it reads. */
export async function loadStackOrder(conversationId: string): Promise<string[]> {
  return (await readStack(conversationId)).map((entry) => entry.key);
}

/** Where a piece filed now belongs: see `nextStackPosition`. */
export async function nextPositionFor(conversationId: string): Promise<number | null> {
  return nextStackPosition((await readStack(conversationId)).map((entry) => entry.position));
}

export type StackOrderResult = { ok: true; order: string[] } | { ok: false };

/**
 * Put the stack in this order. A key from another lesson refuses the whole
 * write; a piece the order leaves out (one waiting out its Undo, say) keeps
 * its turn after the rest rather than losing its place entirely.
 */
export async function writeStackOrder(
  conversationId: string,
  requested: string[]
): Promise<StackOrderResult> {
  const current = await loadStackOrder(conversationId);
  const known = new Set(current);
  if (requested.some((key) => !known.has(key))) return { ok: false };
  const seen = new Set<string>();
  const order = [
    ...requested.filter((key) => !seen.has(key) && seen.add(key)),
    ...current.filter((key) => !seen.has(key)),
  ];
  await prisma.$transaction(
    order.map((key, position) => {
      const ref = parseStackEntryKey(key)!;
      return ref.origin === 'material'
        ? prisma.lessonPlanMaterial.update({
            where: { id: ref.id, conversationId },
            data: { position },
          })
        : prisma.lessonPlanMessage.update({
            where: { id: ref.id, conversationId },
            data: { position },
          });
    })
  );
  return { ok: true, order };
}

/** One step up or down: the keyboard and button way to reorder. */
export async function moveStackEntry(
  conversationId: string,
  key: string,
  direction: 'up' | 'down'
): Promise<StackOrderResult> {
  const order = await loadStackOrder(conversationId);
  const from = order.indexOf(key);
  if (from < 0) return { ok: false };
  const to = direction === 'up' ? from - 1 : from + 1;
  if (to < 0 || to >= order.length) return { ok: true, order };
  const next = [...order];
  [next[from], next[to]] = [next[to]!, next[from]!];
  return writeStackOrder(conversationId, next);
}
