/**
 * "Add everything, then refine in the stack" (Brian's run 2, A4, items 3, 52).
 *
 * Adding a whole lesson used to file one lump — the reply — that could only be
 * kept or removed whole, with its framings bundled inside it. Now every step
 * and every block in the reply is filed as its own piece, in the reply's
 * order, so each can be reordered, removed, renamed and edited in the stack.
 */
import { prisma } from '~/utils/db.server';
import { fileableMaterial, stepColumns, writtenAt } from './fileable-material';
import { pieceKeysInReply } from './reply-pieces';
import { loadStackOrder, writeStackOrder } from './stack-order.server';

export async function fileReplyPieces({
  conversationId,
  message,
  replaceKeptReply = false,
  confirmReplace = false,
  onlyKeys,
}: {
  conversationId: string;
  message: { id: string; createdAt: Date; content: string };
  /**
   * The reply was kept whole (the old way): its pieces take its place in the
   * stack and the whole-reply item goes (E3: framings no longer bundled).
   */
  replaceKeptReply?: boolean;
  /** File over pieces the teacher edited by hand, too. */
  confirmReplace?: boolean;
  /** Only these pieces: one segment of the plan (Brian's run 3, item 1). */
  onlyKeys?: string[];
}): Promise<{ added: string[]; skipped: string[] }> {
  const added: string[] = [];
  const skipped: string[] = [];
  const newKeys: string[] = [];

  const keys = pieceKeysInReply(message.content).filter(
    (key) => !onlyKeys || onlyKeys.includes(key)
  );
  for (const key of keys) {
    const material = fileableMaterial(message.content, key);
    if (!material) continue;
    const existing = await prisma.lessonPlanMaterial.findUnique({
      where: { conversationId_slot: { conversationId, slot: material.slot } },
      select: { sourceMessageId: true, blockKey: true, editedAt: true },
    });
    const differentSource =
      existing &&
      (existing.sourceMessageId !== message.id || existing.blockKey !== material.key);
    if (existing?.editedAt && differentSource && !confirmReplace) {
      skipped.push(material.title);
      continue;
    }
    const fields = {
      kind: material.kind,
      title: material.title,
      audience: material.audience,
      content: material.content,
      sourceCreatedAt: writtenAt(message.createdAt, material),
      sourceMessageId: message.id,
      blockKey: material.key,
      promptId: material.promptId ?? null,
      ...stepColumns(material),
    };
    const saved = await prisma.lessonPlanMaterial.upsert({
      where: { conversationId_slot: { conversationId, slot: material.slot } },
      create: { conversationId, slot: material.slot, ...fields },
      update: { ...fields, editedAt: null },
      select: { id: true },
    });
    newKeys.push(`m:${saved.id}`);
    added.push(`${message.id}:${material.key}`);
  }

  // Lay the pieces out in reply order: where the whole reply sat, when it is
  // being split, otherwise after everything already in the stack.
  const current = await loadStackOrder(conversationId);
  const fresh = new Set(newKeys);
  const replyKey = `r:${message.id}`;
  const rest = current.filter((key) => !fresh.has(key));
  const at = replaceKeptReply ? rest.indexOf(replyKey) : -1;
  const order =
    at >= 0
      ? [...rest.slice(0, at), ...newKeys, ...rest.slice(at + 1)]
      : [...rest.filter((key) => !(replaceKeptReply && key === replyKey)), ...newKeys];

  if (replaceKeptReply) {
    await prisma.lessonPlanMessage.updateMany({
      where: { id: message.id, conversationId },
      data: { keptAt: null, keptAudience: null, position: null },
    });
  }
  if (newKeys.length || replaceKeptReply) await writeStackOrder(conversationId, order);
  return { added, skipped };
}
