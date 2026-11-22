/**
 * A handout asked for after the lesson was built goes into that lesson
 * (13-lesson review, Nov 22): "Build the student handout for this lesson"
 * came back as a card the teacher had to add separately, so the printed
 * packet went out without the passage students annotate. When the teacher
 * asks for the handout and the lesson already has pieces in its stack, the
 * reply's handouts are filed beside them.
 */
import { prisma } from '~/utils/db.server';
import { fileableMaterial } from './fileable-material';
import { fileReplyPieces } from './file-reply-pieces.server';
import { pieceKeysInReply } from './reply-pieces';

/** "Build the student handout for this lesson", and the ways a teacher types it. */
export function asksForHandout(message: string): boolean {
  return /\b(build|make|write|create|give me)\b[^.?!]{0,40}\b(student\s+)?handouts?\b/i.test(message) && !/\bfrom my stack\b/i.test(message);
}

/** The reply's handout pieces, by key. */
export function handoutKeys(content: string): string[] {
  return pieceKeysInReply(content).filter((key) => fileableMaterial(content, key)?.kind === 'handout');
}

export async function fileLaterHandout({
  conversationId,
  message,
  teacherMessage,
}: {
  conversationId: string;
  message: { id: string; createdAt: Date; content: string };
  teacherMessage: string;
}): Promise<string[]> {
  if (!asksForHandout(teacherMessage)) return [];
  const keys = handoutKeys(message.content);
  if (!keys.length) return [];
  const inStack = await prisma.lessonPlanMaterial.count({ where: { conversationId } });
  if (!inStack) return [];
  const { added } = await fileReplyPieces({ conversationId, message, onlyKeys: keys });
  return added;
}
