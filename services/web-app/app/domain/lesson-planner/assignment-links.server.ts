/**
 * Writing the one record per assignment (Oct 24 handoff, task 1): from the
 * chat a piece is named by its reply and block, from the stack by its filed
 * piece. Either way the record is keyed by reply and block, and a filed piece
 * is marked too, so readers that know only the piece still see it.
 */
import { prisma } from '~/utils/db.server';
import { linksByToken, type PieceCreated, type PieceRef } from './assignment-links';

export async function recordAssignmentLink({
  conversationId,
  piece,
  yawpHref,
}: {
  conversationId: string;
  piece: PieceRef;
  yawpHref: string;
}): Promise<{ materialId: string | null } | null> {
  let messageId: string;
  let blockKey: string;
  let materialId: string | null = null;
  if (piece.kind === 'material') {
    const material = await prisma.lessonPlanMaterial.findFirst({
      where: { id: piece.materialId, conversationId },
      select: { id: true, sourceMessageId: true, blockKey: true },
    });
    if (!material) return null;
    messageId = material.sourceMessageId;
    blockKey = material.blockKey;
    materialId = material.id;
  } else {
    const message = await prisma.lessonPlanMessage.findFirst({
      where: { id: piece.messageId, conversationId, role: 'assistant' },
      select: { id: true },
    });
    if (!message) return null;
    messageId = message.id;
    blockKey = piece.blockKey;
  }
  const createdFrom = piece.kind === 'material' ? 'stack' : 'chat';
  await prisma.lessonPlanAssignmentLink.upsert({
    where: { conversationId_sourceMessageId_blockKey: { conversationId, sourceMessageId: messageId, blockKey } },
    create: { conversationId, sourceMessageId: messageId, blockKey, yawpHref, createdFrom },
    // Made again (another class, say): the newest is the one to open.
    update: { yawpHref },
  });
  // A piece already filed, from either page, is marked as well.
  const updated = await prisma.lessonPlanMaterial.updateMany({
    where: { conversationId, sourceMessageId: messageId, blockKey },
    data: { yawpHref, yawpCreatedAt: new Date() },
  });
  if (!materialId && updated.count) {
    const filed = await prisma.lessonPlanMaterial.findFirst({
      where: { conversationId, sourceMessageId: messageId, blockKey },
      select: { id: true },
    });
    materialId = filed?.id ?? null;
  }
  return { materialId };
}

export async function assignmentLinksFor(conversationId: string): Promise<Map<string, PieceCreated>> {
  const rows = await prisma.lessonPlanAssignmentLink.findMany({
    where: { conversationId },
    select: { sourceMessageId: true, blockKey: true, yawpHref: true, createdFrom: true },
  });
  return linksByToken(rows);
}
