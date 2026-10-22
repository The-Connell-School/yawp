/**
 * A piece of a reply, ready to file in the stack with its minutes and type
 * (Brian's run 3, item 9: "Suggest a time for everything").
 *
 * Every way into the stack (one Add, Add everything, Replace) files through
 * here, so a piece gets the same minutes however it got in: its own
 * `minutes:`, else the step it stands for ("## Exit ticket (10 min)" holding
 * only the ticket), else none, and the stack suggests its type's default.
 */
import { artifactFromAssistantReply } from './artifact-from-reply';
import type { LessonMaterial } from './lesson-material';
import { blockMinutesInReply, optionStepMinutes, pieceRankInReply, soleBlockStepMinutes } from './reply-pieces';
import { parseStepType } from './step-types';

const TITLE_MINUTES = /\(\s*\d+[^)]*min/i;

export type FileableMaterial = LessonMaterial & {
  /** Its place in the reply, so pieces of one reply keep the reply's order. */
  rank: number;
};

export function fileableMaterial(
  content: string,
  key: string,
  /** Added on its own from its card, not with the rest of the reply. */
  { alone = false }: { alone?: boolean } = {}
): FileableMaterial | null {
  const found = artifactFromAssistantReply(content, key);
  if (!found) return null;
  const minutes =
    found.minutes ??
    blockMinutesInReply(content)[key] ??
    (alone ? (optionStepMinutes(content)[key] ?? soleBlockStepMinutes(content)[key]) : undefined) ??
    null;
  return {
    rank: pieceRankInReply(content, key),
    ...found,
    // The title keeps "(N min)" too, while the old stack page still reads
    // minutes out of titles (dual-write).
    title:
      minutes != null && !TITLE_MINUTES.test(found.title)
        ? `${found.title} (${minutes} min)`
        : found.title,
    minutes,
  };
}

/**
 * When a filed piece was written, for the stack's written order: its reply's
 * time plus its place in that reply, in milliseconds. Pieces of one reply
 * then read in the reply's order however they were added (Kevin's notes),
 * and never past the next reply, which is seconds later.
 */
export function writtenAt(replyCreatedAt: Date, material: { rank?: number }): Date {
  return new Date(replyCreatedAt.getTime() + (material.rank ?? 0));
}

/** The new step columns for a filed piece. */
export function stepColumns(material: LessonMaterial): {
  minutes: number | null;
  stepType: string | null;
} {
  return {
    minutes: material.minutes ?? null,
    stepType: parseStepType(material.stepType) ?? null,
  };
}
